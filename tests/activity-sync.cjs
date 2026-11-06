// Playwright + Chrome. Every HTTP request is intercepted; no client site is modified.
const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }), base = 'https://feedbackpress.test', root = path.resolve(__dirname, '..');
    const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
    const issue = (n, status = 'todo') => ({ id: id(n), number: String(n), author: 'Client', body: 'Issue ' + n, path: '/test/', created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z', status, conflict: false, revision: 'one', heads: [], status_choices: [], files: [], activity: [], target: { selector: '#target', text: 'Target', x: .5, y: .5 } });
    let items = [issue(1), issue(2, 'review')], calls = 0, fail = false, cursor = 2, holdNext = false, releaseSync = null;
    await ctx.route(base + '/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(root + '/assets/review.css', 'utf8') });
      if (url.pathname === '/api/sync/activity') {
        calls++; assert.equal(route.request().headers()['x-feedbackpress-network'], 'network-test');
        if (fail) return route.fulfill({ status: 500, json: { message: 'Offline' } });
        const snapshot = JSON.parse(JSON.stringify({ state: 'complete', network: 'network-test', cursor, issues: items, new_issues: items.filter(i => parseInt(i.id, 10) > route.request().postDataJSON().since).map(i => i.id) }));
        if (holdNext) { holdNext = false; await new Promise(resolve => { releaseSync = resolve; }); }
        return route.fulfill({ json: snapshot });
      }
      if (url.pathname === '/api/issues') {
        const q = url.searchParams; const found = items.filter(i => (!q.get('path') || i.path === q.get('path')) && (!q.get('status') || q.get('status').split(',').includes(i.status)));
        return route.fulfill({ json: { issues: found, total: found.length, page: 1 } });
      }
      if (url.pathname.startsWith('/api/issues/')) { const item = items.find(i => url.pathname.includes(i.id)); if (url.pathname.endsWith('/status')) { item.status = route.request().postDataJSON().status; item.revision = 'new'; } return route.fulfill({ json: item }); }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="target" style="margin:100px;height:500px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'test',network:'network-test',cursor:2,activitySync:true,userName:'Reviewer',maxBytes:5242880}</script><script>${fs.readFileSync(root + '/assets/review.js', 'utf8')}</script></body></html>` });
    });
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install(); await page.goto(base + '/test/'); await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.pin'));
    assert.equal(calls, 1, 'Landing starts a sync while the sidebar is closed');
    await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Issues' });
    await panel.locator('.issue-row').nth(1).waitFor(); await page.waitForTimeout(100);
    const nums = async () => panel.locator('.row-number').allTextContents();
    const originalY = (await panel.locator('.issue-row').nth(1).boundingBox()).y;
    items[0] = { ...items[0], status: 'done' }; items.push({ ...issue(3), number: 'AB12CD34-3' }); cursor = 3;
    await page.clock.fastForward(60100); await panel.locator(`[data-issue="${id(3)}"]`).waitFor();
    assert.deepEqual(await nums(), ['#1', '#2', '#AB12CD34-3']); assert.equal((await panel.locator('.issue-row').nth(1).boundingBox()).y, originalY);
    await panel.locator(`[data-issue="${id(1)}"] [data-status-action="done"][aria-pressed="true"]`).waitFor();
    await panel.locator(`[data-issue="${id(2)}"] .issue-open`).click();
    const reply = page.getByRole('textbox', { name: 'Reply', exact: true }); await reply.fill('Keep my unsent reply'); await reply.press('End');
    const caret = await reply.evaluate(e => e.selectionStart);
    items[1] = { ...items[1], body: 'Changed remotely', status: 'doing' }; cursor++;
    await page.clock.fastForward(60100); await page.waitForTimeout(50); assert.equal(calls, 3);
    assert.equal(await reply.inputValue(), 'Keep my unsent reply'); assert.equal(await reply.evaluate(e => e.selectionStart), caret);
    const beforeIdle = calls; await page.clock.fastForward(180200); assert.equal(calls, beforeIdle, 'Idle review stops peer checks');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'View issues', exact: true }).click(); await page.waitForTimeout(30); assert.equal(calls, beforeIdle + 1, 'Review interaction resumes checks');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = calls; await page.clock.fastForward(120200); assert.equal(calls, hidden, 'Hidden tabs do not initiate syncs');
    fail = true; await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(30);
    assert.equal(calls, hidden + 1);
    fail = false; holdNext = true;
    await page.clock.fastForward(60100); await page.waitForTimeout(50); assert.equal(typeof releaseSync, 'function');
    const row3 = panel.locator(`[data-issue="${id(3)}"]`);
    await row3.locator('[data-status-action="done"]').click(); await row3.locator('[data-status-action="done"][aria-pressed="true"]').waitFor();
    releaseSync(); await page.waitForTimeout(100); assert.equal(await row3.getAttribute('data-status'), 'done', 'A delayed old snapshot cannot overwrite a newer local save');
    await page.setViewportSize({ width: 320, height: 844 }); await row3.locator('.issue-open').click();
    const popup = page.getByRole('region', { name: 'Issue details' }); await popup.waitFor();
    const box = await popup.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 320);
    assert.ok(await page.getByRole('button', { name: /Issue AB12CD34-3, Done/ }).evaluate(e => e.scrollWidth <= e.clientWidth));
    if (process.env.FEEDBACKPRESS_TEST_SCREENSHOT) await page.screenshot({ path: process.env.FEEDBACKPRESS_TEST_SCREENSHOT });
    assert.deepEqual(errors, []);
    console.log('PASS Activity starts on landing, refreshes live pins/rows without moving them, preserves typed replies, pauses idle/hidden, resumes interaction, and tolerates connection failures.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
