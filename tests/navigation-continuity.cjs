// Real document transitions, intercepted HTTP, and normal motion. No real site or feedback writes.
const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const base = 'https://feedbackpress.test', destination = '/?page_id=2&view=a%20b&view=c', errors = [];
    let actor = 'owner-a', network = 'project-a', denied = false, fail = false, clock = 0, readGate = null, releaseReads;
    const items = Array.from({ length: 80 }, (_, n) => ({
      id: `${String(n + 1).padStart(8, '0')}-1111-4111-8111-111111111111`, number: n + 1,
      title: 'Issue ' + (n + 1), body: 'Shared description', author: 'Reviewer', revision: 1, status: 'todo',
      path: n % 2 ? destination : '/', created_at: '2026-11-11T12:00:00Z', files: [],
      target: { selector: '#target', x: .5, y: .5 },
      activity: Array.from({ length: 20 }, (_, i) => ({ id: 'reply-' + i, kind: 'reply', created_at: '2026-11-11T12:00:00Z', payload: { body: 'Shared reply ' + i, author: 'Reviewer' } }))
    }));
    const observe = `<script>{const r=document.querySelector('#feedbackpress-root').shadowRoot;
      const state=()=>({rows:r.querySelectorAll('.issue-row').length,placeholder:r.querySelectorAll('.list-placeholder').length,selected:r.querySelector('.popup-header strong')?.textContent});
      window.fixtureBoot={...state(),at:performance.now()};window.fixturePaint=null;
      function paint(){const p=r.querySelector('.panel');if(p&&!p.hidden&&p.getBoundingClientRect().width===Math.min(innerWidth,400)&&getComputedStyle(document.querySelector('#feedbackpress-root')).visibility!=='hidden'){
        window.fixturePaint={...state(),at:performance.now(),scroll:r.querySelector('.issue-list').scrollTop,animation:getComputedStyle(p).animationName,thread:r.querySelector('.issue-thread')?.scrollTop};
      }else requestAnimationFrame(paint)}requestAnimationFrame(paint);}</script>`;
    await context.route(base + '/**', async route => {
      const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.slice(5);
      if (url.pathname.endsWith('.css')) { await new Promise(resolve => setTimeout(resolve, 150)); return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') }); }
      if (url.pathname.startsWith('/api/')) {
        await new Promise(resolve => setTimeout(resolve, 900));
        if (readGate) await readGate;
        if (denied) return route.fulfill({ status: 403, json: { message: 'Access revoked' } });
        if (fail) return route.fulfill({ status: 503, json: { message: 'Temporary fixture outage' } });
        if (endpoint.endsWith('/notes')) return route.fulfill({ json: { notes: [{ id: 'note', body: 'PRIVATE_SENTINEL', kind: 'agent', revision: 1, agent: 'Fixture' }] } });
        if (endpoint === 'issues') {
          const found = url.searchParams.has('path') ? items.filter(i => i.path === url.searchParams.get('path')) : items;
          const page = Number(url.searchParams.get('page')) || 1;
          return route.fulfill({ json: { issues: found.slice((page - 1) * 50, page * 50), total: found.length, page } });
        }
        return route.fulfill({ json: items.find(i => endpoint === 'issues/' + i.id) || {} });
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0;min-height:1600px}#target{margin:180px 40px;width:300px;height:200px}</style><a id="ordinary" href="/third/">Other page</a><div id="target">Target</div>
        <script>{const now=Date.now;window.fixtureClock=${clock};Date.now=()=>now()+window.fixtureClock;}window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',css:'${base}/review.css',nonce:'fixture',network:'${network}',authorId:'${actor}',userName:'Reviewer',privateNotes:true,maxBytes:5242880}</script>
        <script>${fs.readFileSync('assets/review.js', 'utf8')}</script>${observe}` });
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true }), list = panel.locator('.issue-list');
    const popup = page.getByRole('region', { name: 'Issue details', exact: true });
    const ready = () => page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-list')?.getAttribute('aria-busy') === 'false');
    const paint = () => page.waitForFunction(() => window.fixturePaint);
    await page.goto(base); await page.getByRole('button', { name: 'View issues', exact: true }).click(); await ready();
    await list.locator('.issue-row').nth(49).waitFor();
    await list.evaluate(node => { node.scrollTop = 700; });
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('feedbackpress-view:https://feedbackpress.test')).scrollTop === 700);
    const selectedId = await list.evaluate(node => [...node.querySelectorAll('.issue-row')].find(row => {
      const rect = row.getBoundingClientRect(), bounds = node.getBoundingClientRect();
      return row.querySelector('.page-reference').textContent.includes('page_id=2') && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    }).dataset.issue);
    // A long read must still carry the currently displayed view, with a fresh short handoff lifetime.
    clock = 31000; await page.evaluate(() => { window.fixtureClock = 31000; });
    readGate = new Promise(resolve => { releaseReads = resolve; });
    await list.locator(`[data-issue="${selectedId}"] .issue-open`).click();
    await page.waitForURL(base + destination + '#feedbackpress=' + selectedId); await paint();
    const first = await page.evaluate(() => ({ boot: fixtureBoot, paint: fixturePaint }));
    console.log('Cross-page first render:', JSON.stringify(first));
    if (process.env.FEEDBACKPRESS_BASELINE) return;
    assert.equal(first.boot.rows, 50); assert.equal(first.boot.placeholder, 0);
    assert.equal(first.paint.rows, 50); assert.equal(first.paint.scroll, 700); assert.equal(first.paint.animation, 'none');
    // API delivery is held until after this paint; the UI must not depend on a response.
    releaseReads(); readGate = null;
    await ready();
    await popup.locator('.issue-thread').evaluate(node => { node.scrollTop = 350; });
    await page.locator('#ordinary').click(); await page.waitForURL(base + '/third/'); await paint();
    assert.equal((await page.evaluate(() => fixtureBoot)).rows, 50); assert.equal((await page.evaluate(() => fixturePaint)).scroll, 700);
    await page.goBack(); await paint();
    assert.equal((await page.evaluate(() => fixtureBoot)).rows, 50);
    assert.equal((await page.evaluate(() => fixturePaint)).thread, 350);
    const storage = await page.evaluate(() => JSON.stringify(Object.values(sessionStorage)));
    assert.ok(!storage.includes('PRIVATE_SENTINEL'), 'Private content must never enter the navigation cache');
    const cache = await page.evaluate(() => sessionStorage.getItem('feedbackpress-shared-cache:https://feedbackpress.test:project-a:owner-a'));
    assert.ok(cache.length <= 1024 * 1024); assert.ok(JSON.parse(cache).entries.length <= 200);
    await page.setViewportSize({ width: 390, height: 844 });
    // Let the resize handler switch the drawer/popup before choosing the mobile action.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (!await panel.isVisible()) await page.keyboard.press('v');
    const mobileId = await list.evaluate((node, home) => [...node.querySelectorAll('.issue-row')].find(row => {
      const rect = row.getBoundingClientRect(), bounds = node.getBoundingClientRect();
      return row.querySelector('.page-reference').textContent === home && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    })?.dataset.issue, base + '/');
    assert.ok(mobileId, 'A current-view homepage row is visible without scrolling.');
    await list.locator(`[data-issue="${mobileId}"] .issue-open`).click();
    await page.waitForURL(base + '/#feedbackpress=' + mobileId); await popup.waitFor();
    assert.equal((await page.evaluate(() => fixtureBoot)).rows, 50);
    await page.keyboard.press('v'); await panel.waitFor(); await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await list.evaluate(node => node.scrollTop), 700); assert.equal(await popup.isVisible(), false);
    assert.equal(await list.locator('.is-selected').count(), 1);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(base + destination + '#feedbackpress=' + selectedId); await paint();
    // Restore real rows during a temporary outage; refresh failure must not replace them with placeholders.
    fail = true; await page.reload(); await paint();
    await page.getByText('Temporary fixture outage', { exact: true }).first().waitFor();
    assert.equal(await list.locator('.issue-row').count(), 50); assert.equal(await list.locator('.list-placeholder').count(), 0); fail = false;
    // Cached state belongs to the exact project and WP actor.
    actor = 'owner-b'; await page.goto(base + '/third/'); assert.equal((await page.evaluate(() => fixtureBoot)).rows, 0);
    network = 'project-b'; await page.reload(); assert.equal((await page.evaluate(() => fixtureBoot)).rows, 0);
    actor = 'owner-a'; network = 'project-a';
    // Expiry must fall back to an honest cold read, rather than presenting indefinitely old rows.
    await page.evaluate(() => { for (const key of Object.keys(sessionStorage).filter(key => key.startsWith('feedbackpress-shared-cache:'))) {
      const value = JSON.parse(sessionStorage.getItem(key));
      for (const entry of value.entries) entry.at -= 31000;
      if (value.view) value.view.at -= 31000;
      sessionStorage.setItem(key, JSON.stringify(value));
    } });
    await page.goto(base + '/third/'); assert.equal((await page.evaluate(() => fixtureBoot)).rows, 0); await ready();
    denied = true; await page.reload(); await page.getByText('Access revoked', { exact: true }).first().waitFor();
    assert.equal(await list.locator('.issue-row').count(), 0); assert.equal(await popup.isVisible(), false);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('feedbackpress-shared-cache:https://feedbackpress.test:project-a:owner-a')), null);
    assert.deepEqual(errors, []);
    console.log('PASS Restored first paint before API, no repeated drawer animation/placeholders, exact list/thread scroll, real query navigation, temporary outage, scoped actor/project cache, private exclusion, expiry and denied-access clearing.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
