// Synthetic issue gateway; no WordPress or service writes.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', context = await browser.newContext(), requests = [];
    await context.route(base + '/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (url.pathname.endsWith('.woff2')) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (url.pathname === '/api/issues') { requests.push(Object.fromEntries(url.searchParams)); return route.fulfill({ json: { issues: [], total: 0, page: 1 } }); }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><body><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Reviewer'}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true }), order = panel.getByLabel('Order issues');
    await order.waitFor();
    const select = async value => {
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/issues' && new URL(response.url()).searchParams.get('order') === value);
      await order.selectOption(value); await response;
      await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-list')?.getAttribute('aria-busy') === 'false');
      return requests.at(-1).status.split(',');
    };
    assert.deepEqual(await select('created_desc'), ['todo', 'needs_info', 'review']);
    assert.deepEqual(await select('completed_desc'), ['todo', 'needs_info', 'review', 'done']);
    assert.deepEqual(await select('completed_asc'), ['todo', 'needs_info', 'review', 'done']);
    assert.deepEqual(await select('created_asc'), ['todo', 'needs_info', 'review', 'done']);
    // Explicitly hiding Done remains possible; selecting the other completion order re-enables it.
    const done = panel.locator('[data-filter-status="done"]');
    if (!await done.isVisible()) await panel.getByRole('button', { name: 'Filter statuses', exact: true }).click();
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/issues' && !new URL(response.url()).searchParams.get('status')?.split(',').includes('done'));
    await done.click(); await response;
    await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-list')?.getAttribute('aria-busy') === 'false');
    assert.deepEqual(await select('completed_asc'), ['todo', 'needs_info', 'review', 'done']);
    await page.reload(); await order.waitFor();
    assert.equal(await order.inputValue(), 'completed_asc');
    assert.deepEqual(requests.at(-1).status.split(','), ['todo', 'needs_info', 'review', 'done']);
    assert.deepEqual(errors, []);
    console.log('PASS Both completion sorts include Done, preserve other filters, avoid duplicates, allow manual hiding, and persist across reload.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
