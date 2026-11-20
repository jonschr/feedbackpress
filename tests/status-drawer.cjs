// Intercepted browser fixture: no site or service writes.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const states = ['todo', 'needs_info', 'doing', 'review', 'done']; let writes = 0;
    const items = states.map((status, i) => ({ id: `${i + 1}1111111-1111-4111-8111-111111111111`, number: i + 1, title: 'Ticket ' + (i + 1), body: 'Review content', author: 'Reviewer', created_at: '2026-11-19T12:00:00Z', path: '/', status, revision: 1, target: { selector: '#target', x: .5, y: .5 }, activity: [], files: [] }));
    await context.route(base + '/**', route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (path.endsWith('.woff2')) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (path === '/api/issues') {
        const statuses = (url.searchParams.get('status') || states.join(',')).split(',');
        const issues = items.filter(item => statuses.includes(item.status));
        return route.fulfill({ json: { issues, total: issues.length, page: 1, status_counts: Object.fromEntries(states.map(status => [status, items.filter(item => item.status === status).length])) } });
      }
      if (path.startsWith('/api/')) {
        const item = items.find(item => path.includes(item.id));
        if (path.endsWith('/status')) { item.status = req.postDataJSON().status; item.revision++; writes++; }
        return route.fulfill({ json: item || {} });
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:200px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',userName:'Reviewer',nonce:'fixture'}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true }), trigger = panel.getByRole('button', { name: 'Filter statuses', exact: true }), drawer = panel.locator('.status-filter-options');
    await panel.locator('.issue-row').nth(2).waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true'); await drawer.waitFor();
    assert.deepEqual(await drawer.locator('input').evaluateAll(nodes => nodes.map(node => node.checked)), [true, true, false, true, false]);
    await page.evaluate(() => document.fonts.ready);
    const summary = panel.locator('.filter-summary'), selectedWidth = (await trigger.boundingBox()).width;
    assert.equal(await summary.textContent(), '3 statuses');
    for (const [status, checked, label] of [['Review', false, '2 statuses'], ['Information needed', false, '1 status'], ['To do', false, '0 statuses'], ['To do', true, '1 status'], ['Information needed', true, '2 statuses'], ['Review', true, '3 statuses']]) {
      await drawer.getByRole('checkbox', { name: status, exact: true }).setChecked(checked);
      await page.waitForFunction(({ label, width }) => {
        const root = document.querySelector('#feedbackpress-root').shadowRoot, trigger = root.querySelector('.status-filter-trigger');
        return root.querySelector('.filter-summary')?.textContent === label && trigger && Math.abs(trigger.getBoundingClientRect().width - width) < 1;
      }, { label, width: selectedWidth });
    }
    const controls = await panel.locator('.list-controls').boundingBox(), options = await drawer.boundingBox();
    assert.ok(options.y >= controls.y + controls.height); assert.ok(Math.abs(options.width - controls.width) < 1);
    const cells = await drawer.locator('.filter-option').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, color: getComputedStyle(node).color, icon: node.querySelector('svg').getBoundingClientRect().width })));
    assert.ok(Math.max(...cells.map(cell => cell.width)) - Math.min(...cells.map(cell => cell.width)) < 1); assert.ok(cells.every(cell => cell.icon === 22)); assert.equal(new Set(cells.map(cell => cell.color)).size, 5);
    await panel.getByRole('searchbox').click(); assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'Outside interaction must leave drawer open');
    await drawer.getByRole('checkbox', { name: 'Done', exact: true }).check(); await panel.locator('.issue-row').nth(3).waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true'); assert.equal(await drawer.getByRole('checkbox', { name: 'Done', exact: true }).isChecked(), true);
    await drawer.getByRole('checkbox', { name: 'Doing', exact: true }).focus(); await page.keyboard.press('Space'); await panel.locator('.issue-row').nth(4).waitFor();
    assert.equal(await summary.textContent(), 'All statuses');
    assert.ok(Math.abs((await trigger.boundingBox()).width - selectedWidth) < 1);
    await page.keyboard.press('Escape'); assert.equal(await trigger.getAttribute('aria-expanded'), 'false'); assert.equal(await drawer.isVisible(), false);
    assert.equal(await trigger.evaluate(node => node === node.getRootNode().activeElement), true);
    await page.reload(); await panel.waitFor(); assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click(); await drawer.waitFor();
    await panel.locator('.issue-open').first().click(); assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'Opening a ticket must not collapse drawer');
    const popup = page.getByRole('region', { name: 'Issue details', exact: true }); await popup.waitFor();
    await popup.getByRole('button', { name: 'Dismiss issue', exact: true }).click();
    await panel.locator('.issue-row').first().hover(); await page.keyboard.press('3');
    await panel.locator('.issue-row').first().locator('[data-status-action="doing"][aria-pressed="true"]').waitFor(); await page.waitForFunction(() => !document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=text]')); assert.equal(writes, 1, 'Open drawer must not block ticket shortcuts');
    await panel.getByRole('button', { name: 'Dismiss issues', exact: true }).click(); await page.getByRole('button', { name: 'View issues', exact: true }).click(); assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await page.reload(); await panel.waitFor(); assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (!await panel.isVisible()) await page.keyboard.press('v');
      await panel.waitFor();
      assert.ok(await panel.evaluate(node => node.scrollWidth <= node.clientWidth));
      const boxes = await drawer.locator('.filter-option').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width)); assert.ok(boxes.every(width => width >= 44));
    }
    await page.screenshot({ path: '/tmp/feedbackpress-status-drawer-320.png' });
    await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: '/tmp/feedbackpress-status-drawer-desktop.png' });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: '/tmp/feedbackpress-status-drawer-dark.png' });
    assert.deepEqual(errors, []); console.log('PASS Status drawer: default open, five equal colored larger icons/counts, full-width second row, multi-select/focus, keyboard, persistent collapse/reopen, ordinary interactions, shortcuts and 320px layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
