// Actual head bootstrap and document navigation; all access/content/asset responses intercepted.
const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const base = 'https://feedbackpress.test', errors = [], events = [];
    const issue = { id: '11111111-1111-4111-8111-111111111111', number: 1, author: 'Reviewer', author_id: 'owner', title: 'Cached issue', body: 'Shared text', path: '/', status: 'todo', revision: '1', created_at: '2026-11-19T12:00:00Z', files: [], activity: [], target: { selector: '#target', x: .5, y: .5 } };
    let hold = false, denied = false, cssFailure = false, releaseAccess, releaseTheme, accessWaiting, themeWaiting, captureLoads = 0;
    const config = { home: base, api: base + '/api/', css: base + '/review.css', nonce: 'test', userName: 'Reviewer', authorId: 'owner', network: 'project', maxBytes: 5242880 };
    const boot = { home: base, api: config.api, css: config.css, script: base + '/review.js', nonce: 'test' };
    await ctx.route(base + '/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path === '/access.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('assets/review-access.js', 'utf8') });
      if (path === '/review.js') { events.push('script'); return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('assets/review.js', 'utf8') }); }
      if (path === '/review.css') { events.push('css'); return cssFailure ? route.abort() : route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') }); }
      if (path.endsWith('.woff2')) return route.fulfill({ body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (path === '/capture.js') { captureLoads++; return route.fulfill({ contentType: 'text/javascript', body: 'window.html2canvas=async()=>{window.fixtureCaptures=(window.fixtureCaptures||0)+1;const canvas=document.createElement("canvas");canvas.width=40;canvas.height=40;return canvas;};' }); }
      if (path === '/theme.js') { if (hold) { themeWaiting(); await new Promise(resolve => { releaseTheme = resolve; }); } return route.fulfill({ contentType: 'text/javascript', body: '' }); }
      if (path === '/api/review-session') {
        events.push('access');
        if (hold) { accessWaiting(); await new Promise(resolve => { releaseAccess = resolve; }); }
        return denied ? route.fulfill({ status: 403, json: { message: 'Access ended' } }) : route.fulfill({ json: { config, script: boot.script, capture: base + '/capture.js' } });
      }
      if (path.startsWith('/api/')) return route.fulfill({ json: path === '/api/issues' ? { issues: [issue], total: 1, page: 1 } : issue });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:1300px}#target{margin:140px 30px;height:200px}#bar{position:fixed;top:0;left:0;width:100%;height:30px}</style><script>window.FeedbackPressAccess=${JSON.stringify(boot)};</script><script src="/access.js"></script><script src="/theme.js"></script></head><body><header id="bar">Fixed navigation</header><a id="next" href="/next/">Next page</a><div id="target">Page content</div><script>window.fixtureFrames=[];function sample(){const r=document.documentElement.getBoundingClientRect();fixtureFrames.push({width:r.width,x:r.x,room:document.documentElement.getAttribute('data-feedbackpress-room')});if(fixtureFrames.length<120)requestAnimationFrame(sample)}requestAnimationFrame(sample);</script></body></html>` });
    });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true });
    await panel.locator('.issue-row').waitFor();
    await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-list').getAttribute('aria-busy') === 'false');
    assert.equal(captureLoads, 0, 'Sidebar startup must not fetch the screenshot renderer');
    for (const side of ['right', 'left']) {
      await panel.getByRole('radio', { name: side === 'left' ? 'Left' : 'Right', exact: true }).check();
      events.length = 0; hold = true;
      const accessStarted = new Promise(resolve => { accessWaiting = resolve; });
      const themeStarted = new Promise(resolve => { themeWaiting = resolve; });
      const navigation = page.goto(base + '/next/?side=' + side, { waitUntil: 'domcontentloaded' });
      await Promise.all([accessStarted, themeStarted]);
      const early = await page.evaluate(() => ({ state: document.readyState, width: document.documentElement.getBoundingClientRect().width, x: document.documentElement.getBoundingClientRect().x, shell: document.querySelector('#feedbackpress-boot')?.getBoundingClientRect().toJSON(), root: Boolean(document.querySelector('#feedbackpress-root')), styles: document.querySelectorAll('style[data-feedbackpress-layout]').length }));
      assert.equal(early.state, 'loading'); assert.equal(early.root, false); assert.equal(early.styles, 1);
      assert(Math.abs(early.width - 880) < 1, JSON.stringify(early));
      assert(Math.abs(early.x - (side === 'left' ? 400 : 0)) < 1, JSON.stringify(early));
      assert(Math.abs(early.shell.width - 400) < 1, JSON.stringify(early));
      assert(Math.abs(early.shell.x - (side === 'left' ? 0 : 880)) < 1, JSON.stringify(early));
      releaseTheme(); await navigation;
      if (side === 'right') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-feedbackpress-room') && Math.round(document.querySelector('#feedbackpress-boot').getBoundingClientRect().width) === 390);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.waitForFunction(() => Math.round(document.documentElement.getBoundingClientRect().width) === 880);
        await page.evaluate(() => { fixtureFrames.length = 0; });
      }
      assert.equal(await page.locator('#feedbackpress-root').count(), 0, 'Cached issue text must wait for fresh authorization');
      assert(events.includes('script') && events.includes('css'), 'UI assets preload while access is pending');
      const firstFrame = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve({ width: document.documentElement.getBoundingClientRect().width, rows: document.querySelector('#feedbackpress-root')?.shadowRoot.querySelectorAll('.issue-row').length || 0 }))));
      assert(Math.abs(firstFrame.width - 880) < 1); assert.equal(firstFrame.rows, 0);
      hold = false; releaseAccess();
      await panel.locator('.issue-row').waitFor();
      await page.waitForFunction(() => !document.querySelector('#feedbackpress-boot'));
      const frames = await page.evaluate(() => fixtureFrames);
      assert(frames.every(f => Math.abs(f.width - 880) < 1 && Math.abs(f.x - (side === 'left' ? 400 : 0)) < 1), JSON.stringify(frames));
      assert.equal(await page.locator('style[data-feedbackpress-layout]').count(), 1);
      assert.equal(await panel.evaluate(n => getComputedStyle(n).animationName), 'none');
      assert.equal(await page.locator('#bar').evaluate(n => Math.round(n.getBoundingClientRect().width)), 880);
    }
    await page.screenshot({ path: '/tmp/feedbackpress-sidebar-startup.png' });
    // The renderer starts only when a screenshot is requested and is reused afterward.
    await panel.getByRole('button', { name: 'Leave feedback', exact: true }).click();
    await page.locator('#target').click();
    await page.waitForFunction(() => window.fixtureCaptures === 1);
    assert.equal(captureLoads, 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Leave feedback', exact: true }).click(); await page.locator('#target').click();
    await page.waitForFunction(() => window.fixtureCaptures === 2); assert.equal(captureLoads, 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'View issues', exact: true }).click();
    denied = true; await page.goto(base + '/denied/');
    await page.waitForFunction(() => !document.querySelector('#feedbackpress-boot'));
    assert.equal(await page.locator('#feedbackpress-root').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-feedbackpress-room'), null);
    assert.equal(await page.locator('html').evaluate(n => Math.round(n.getBoundingClientRect().width)), 1280);
    denied = false; cssFailure = true; await page.goto(base + '/css-failed/');
    await page.waitForFunction(() => !document.querySelector('#feedbackpress-boot') && !document.querySelector('#feedbackpress-root'));
    assert.equal(await page.locator('html').getAttribute('data-feedbackpress-room'), null);
    assert.deepEqual(errors, []);
    console.log('PASS head-time access/assets, prepaint left/right page fit and shell, no navigation resize frames, cached content authorization, renderer lazy loading/reuse, denied-access/CSS-failure cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
