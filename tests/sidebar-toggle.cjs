// Intercepted gateway only; selection changes must never write feedback.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const items = [1, 2].map(n => ({ id: `${n}1111111-1111-4111-8111-111111111111`, number: n, title: 'Ticket ' + n, author: 'Client', body: 'Original note', status: 'todo', revision: 1, path: '/?example=1', created_at: '2026-11-20T12:00:00Z', target: { selector: '#target', x: .5, y: .5 }, files: [], activity: [{ id: 'reply-' + n, kind: 'reply', created_at: '2026-11-20T12:01:00Z', payload: { author: 'Reviewer', body: 'Existing reply' } }] }));
    let hold = true, release, writes = 0;
    const pending = new Promise(resolve => { release = resolve; });
    await context.route(base + '/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (path.endsWith('.woff2')) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (path.startsWith('/api/')) {
        if (request.method() !== 'GET') writes++;
        if (path === '/api/issues') return route.fulfill({ json: { issues: items, total: 2, page: 1 } });
        const item = items.find(item => path === '/api/issues/' + item.id);
        if (item && hold) await pending;
        return route.fulfill({ json: item || {} });
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:200px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',userName:'Reviewer',nonce:'fixture'}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/?example=1'); await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true }), popup = page.getByRole('region', { name: 'Issue details', exact: true });
    const row = n => panel.locator(`[data-issue="${items[n - 1].id}"]`), title = n => row(n).locator('.issue-open');
    const inactive = async () => { assert.equal(await popup.isVisible(), false); assert.equal(await panel.isVisible(), true); assert.equal(await panel.locator('.is-selected').count(), 0); assert.equal(await panel.locator('[aria-current]').count(), 0); assert.equal(new URL(page.url()).hash, ''); assert.equal(new URL(page.url()).search, '?example=1'); };
    await title(1).click(); await popup.waitFor(); await popup.getByRole('textbox', { name: 'Reply', exact: true }).fill('Unsent reply');
    await title(1).click(); await inactive();
    const response = page.waitForResponse(response => response.url().endsWith('/issues/' + items[0].id)); hold = false; release(); await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await inactive();
    await row(1).locator('.row-number').click(); await popup.waitFor(); assert.equal(await popup.getByRole('textbox', { name: 'Reply', exact: true }).inputValue(), 'Unsent reply');
    await row(1).locator('.row-replies').click(); await inactive();
    await title(1).press('Enter'); await popup.waitFor(); await title(1).press('Enter'); await inactive();
    await row(1).locator('.row-meta').click(); await popup.waitFor(); await row(1).locator('.row-meta').click(); await inactive();
    await title(1).click(); await title(2).click(); await popup.locator('.issue-reference').filter({ hasText: 'Issue 2' }).waitFor(); await title(2).click(); await inactive();
    await page.setViewportSize({ width: 320, height: 844 }); await title(1).click(); await popup.waitFor(); await page.keyboard.press('v'); await panel.waitFor(); await title(1).click(); await inactive();
    assert.equal(writes, 0); assert.deepEqual(errors, []);
    console.log('PASS Sidebar selection toggles via title/number/replies/background/keyboard, preserves sidebar and draft, clears fragment/highlight, ignores late reads, switches issues and works in mobile list view; zero writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
