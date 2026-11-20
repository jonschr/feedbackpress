// Synthetic page and intercepted gateway; no live content writes.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const id = n => String(n).repeat(8) + '-1111-4111-8111-111111111111';
    const items = [1, 2, 3, 4].map(n => ({ id: id(n), number: n, author: 'Client', author_id: 'client', body: 'Note ' + n, title: 'Ticket ' + n, path: '/', status: 'todo', revision: n, target_revision: n, created_at: `2026-11-0${n}T12:00:00Z`, target: n === 1 ? { selector: '#target', text: 'Target', x: .5, y: .5 } : { selector: '', text: 'Page feedback', x: .5, y: .5 }, files: [], activity: [] }));
    items[3].path = '/other/';
    let writes = 0, fail = false, hold, release, next = 5;
    await context.route(base + '/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (path.endsWith('.woff2')) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (path.startsWith('/api/')) {
        const item = items.find(item => path.includes(item.id));
        if (path.endsWith('/target')) {
          writes++;
          if (hold) await hold;
          if (fail) return route.fulfill({ status: 500, json: { message: 'Try again' } });
          const body = req.postDataJSON(); assert.equal(body.revision, item.target_revision);
          item.target = body.target; item.revision++; item.target_revision++;
        }
        if (path.endsWith('/status')) { item.status = req.postDataJSON().status; item.revision++; }
        if (path === '/api/issues' && req.method() === 'POST') {
          const created = { ...items[1], ...req.postDataJSON(), id: id(next), number: next++, revision: 1, target_revision: 1, created_at: new Date().toISOString() };
          items.push(created); return route.fulfill({ json: created });
        }
        if (path === '/api/issues') return route.fulfill({ json: { issues: [...items].reverse(), total: items.length, page: 1 } });
        return route.fulfill({ json: item || {} });
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="height:2400px"><div id="target" style="position:absolute;left:350px;top:300px;width:200px;height:160px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'test',userName:'Reviewer',authorId:'reviewer'}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    const rail = page.locator('.page-notes'), drop = page.getByRole('button', { name: 'Add page note', exact: true }), popup = page.getByRole('region', { name: 'Issue details', exact: true });
    const pin = n => page.locator(`[data-pin-issue="${id(n)}"]`);
    const order = () => page.locator('.page-note-pins .pin').evaluateAll(nodes => nodes.map(node => node.textContent));
    await pin(2).waitFor(); assert.equal(await drop.isVisible(), false); assert.deepEqual(await order(), ['2', '3']); assert.equal(await pin(4).count(), 0);
    const initialStack = await rail.boundingBox(); assert.ok(Math.abs(initialStack.y + initialStack.height / 2 - 450) < 1);
    const center = async locator => { const r = await locator.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const clearControls = async () => {
      if (!await popup.isVisible()) return;
      const card = await popup.boundingBox();
      for (const control of [rail, drop]) {
        if (!await control.isVisible()) continue;
        const rect = await control.boundingBox();
        assert.ok(card.x + card.width <= rect.x || card.x >= rect.x + rect.width || card.y + card.height <= rect.y || card.y >= rect.y + rect.height, 'Open ticket must leave page-note controls clear');
      }
    };
    const drag = async (locator, destination, cancel = false) => {
      const p = await center(locator); await page.mouse.move(p.x, p.y); await page.mouse.down();
      if (destination === 'page') { await page.mouse.move(p.x + 12, p.y + 12, { steps: 2 }); await drop.waitFor(); const stack = await rail.boundingBox(), zone = await drop.boundingBox(); if (stack) assert.ok(zone.x >= stack.x + stack.width + 10); destination = await center(drop); }
      await page.mouse.move(destination.x, destination.y, { steps: 12 });
      await clearControls();
      const dragged = await center(locator); assert.ok(Math.abs(dragged.x - destination.x) < 2 && Math.abs(dragged.y - destination.y) < 2, 'Dragged marker must follow the pointer');
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
      await page.waitForTimeout(550); // Let the existing post-drag click suppression expire.
    };
    await page.getByRole('button', { name: 'View issues', exact: true }).click();
    await page.getByRole('radio', { name: 'Overlay page', exact: true }).check();
    await page.keyboard.press('Escape');
    const oldY = (await pin(2).boundingBox()).y;
    await page.evaluate(() => scrollTo(0, 600)); assert.equal((await pin(2).boundingBox()).y, oldY);
    await pin(2).click(); await popup.waitFor(); await clearControls(); assert.equal(await page.evaluate(() => scrollY), 600);
    await page.keyboard.press('Escape'); await page.evaluate(() => scrollTo(0, 0));
    await drag(pin(1), 'page', true); assert.equal(writes, 0); assert.equal(await pin(1).getAttribute('class').then(c => c.includes('page-note-pin')), false);
    fail = true; await drag(pin(1), 'page');
    await page.getByText('Try again', { exact: true }).waitFor(); assert.equal(items[0].target.selector, '#target');
    await pin(1).click(); await popup.waitFor(); await clearControls();
    fail = false; hold = new Promise(resolve => { release = resolve; });
    await drag(pin(1), 'page'); assert.equal(await drop.getAttribute('data-over'), '');
    release(); hold = null; await page.locator('.page-note-pins').locator(`[data-pin-issue="${id(1)}"]`).waitFor();
    assert.deepEqual(await order(), ['1', '2', '3']); assert.equal(items[0].target.selector, '');
    await pin(1).click(); await popup.waitFor(); assert.equal(await popup.getByText('Note 1', { exact: true }).count(), 1);
    await clearControls();
    await drag(pin(1), { x: 400, y: 340 }); await page.locator('.pins').locator(`[data-pin-issue="${id(1)}"]`).waitFor();
    assert.equal(items[0].target.selector, '#target'); assert.equal(await popup.isVisible(), true); await clearControls();
    await popup.getByRole('button', { name: 'Actions for issue', exact: true }).click();
    await page.locator('.note-actions:popover-open').getByRole('button', { name: 'Make page note', exact: true }).click();
    await page.locator('.page-note-pins').locator(`[data-pin-issue="${id(1)}"]`).waitFor();
    assert.equal(items[0].body, 'Note 1'); assert.equal(items[0].author, 'Client'); assert.equal(items[0].path, '/');
    await page.keyboard.press('Escape');
    assert.equal(await drop.isVisible(), false); await page.keyboard.press('c'); await drop.waitFor();
    const zone = await drop.boundingBox(); assert.ok(Math.abs(zone.y + zone.height / 2 - 450) < 1); assert.ok(zone.width >= 200 && zone.height >= 150); const stack = await rail.boundingBox(); assert.ok(zone.x >= stack.x + stack.width + 10); assert.ok(Math.abs(stack.y + stack.height / 2 - 450) < 1);
    assert.equal(await drop.locator('.page-note-plus').count(), 1); assert.equal(await drop.locator('.page-note-label').textContent(), 'Add page note'); assert.equal(await drop.evaluate(node => getComputedStyle(node).textTransform), 'uppercase');
    const plusBox = await drop.locator('.page-note-plus').boundingBox(), labelBox = await drop.locator('.page-note-label').boundingBox();
    assert.ok(plusBox.y + plusBox.height <= labelBox.y); assert.ok(Math.abs(plusBox.x + plusBox.width / 2 - labelBox.x - labelBox.width / 2) < 1);
    assert.equal(await drop.locator('.page-note-plus').textContent(), '+');
    assert.deepEqual(await drop.evaluate(node => { const s = getComputedStyle(node); return [s.borderTopStyle, s.borderTopWidth, s.borderTopLeftRadius]; }), ['dashed','2px','8px']);
    await drop.hover(); assert.equal(await drop.locator('.page-note-plus').isVisible(), true);
    assert.equal(await drop.evaluate(node => getComputedStyle(node).cursor), 'pointer');
    for (const part of ['.page-note-plus', '.page-note-label']) {
      const point = await center(drop.locator(part)); await page.mouse.move(point.x, point.y);
      assert.equal(await drop.evaluate((node, point) => node.getRootNode().elementFromPoint(point.x, point.y) === node, point), true, 'Text and plus share one stable hover target');
      assert.equal(await drop.locator(part).evaluate(node => getComputedStyle(node).cursor), 'pointer');
    }
    assert.equal(await drop.evaluate(node => getComputedStyle(node).userSelect), 'none');
    await page.mouse.move(700, 600); const roundCursor = await page.locator('#target').evaluate(node => getComputedStyle(node).cursor); assert.ok(!decodeURIComponent(roundCursor).includes('<rect'));
    await drop.hover(); assert.equal(await page.locator('.highlight').isVisible(), false);
     assert.equal(await drop.evaluate(node => node.tagName), 'DIV');
    await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.page-note-drop').dataset.contrast === 'dark');
    await page.screenshot({ path: '/tmp/feedbackpress-page-drop-light.png' });
    await page.evaluate(() => document.body.style.background = '#171b22');
    await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.page-note-drop').dataset.contrast === 'light');
    await page.screenshot({ path: '/tmp/feedbackpress-page-drop-dark.png' });
    await page.evaluate(() => document.body.style.background = '#f5eddb');
    await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.page-note-drop').dataset.contrast === 'dark');
    await page.screenshot({ path: '/tmp/feedbackpress-page-drop-cream.png' });
    await page.evaluate(() => document.body.style.background = '#777');
    await page.waitForFunction(() => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.page-note-drop').dataset.contrast === 'light');
    await page.screenshot({ path: '/tmp/feedbackpress-page-drop-midtone.png' });
    await page.evaluate(() => document.body.style.background = 'linear-gradient(110deg, #172333, #b58855 22%, #efddba 45%, #475e43 70%, #151c26)');
    await page.screenshot({ path: '/tmp/feedbackpress-page-drop-image.png' });
    assert.equal(await drop.getAttribute('data-contrast'), 'light');
    for (const [fill, expected] of [['#6b5438', 'light'], ['#f5eddb', 'dark']]) {
      await page.evaluate(fill => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4; const ctx = canvas.getContext('2d'); ctx.fillStyle = fill; ctx.fillRect(0, 0, 4, 4); document.body.style.background = `#171b22 url("${canvas.toDataURL()}") center / cover no-repeat`; }, fill);
      await page.waitForFunction(expected => document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.page-note-drop').dataset.contrast === expected, expected);
    }


    await page.evaluate(() => document.body.style.background = '');
    await drop.click(); assert.equal(await drop.isVisible(), false); const composer = page.getByRole('region', { name: 'New feedback', exact: true });
    await composer.getByRole('textbox', { name: 'Issue title', exact: true }).fill('General page note');
    await composer.getByRole('button', { name: 'Submit feedback', exact: true }).click();
    await pin(5).waitFor(); assert.equal(items.at(-1).target.selector, ''); assert.deepEqual(await order(), ['1', '2', '3', '5']);
    await page.keyboard.press('Escape'); await page.reload(); await pin(5).waitFor(); assert.deepEqual(await order(), ['1', '2', '3', '5']);
    // Page-note shortcuts use the same deliberate hover target as positioned pins.
    await pin(2).hover(); const statusSaved = page.waitForResponse(response => response.url().endsWith('/status'));
    await page.keyboard.press('3'); await statusSaved; assert.equal(items[1].status, 'doing');
    await pin(2).waitFor({ state: 'detached' });
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true });
    await panel.getByRole('radio', { name: 'Left', exact: true }).check(); assert.ok((await rail.boundingBox()).x >= 400);
    await panel.getByRole('radio', { name: 'Overlay page', exact: true }).check(); assert.ok((await rail.boundingBox()).x >= 400);
    await page.screenshot({ path: '/tmp/feedbackpress-page-notes-desktop.png' });
    await page.keyboard.press('Escape');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await pin(3).waitFor();
      const r = await rail.boundingBox(); assert.ok(r.x >= 0 && r.x + r.width <= width); assert.ok(Math.abs(r.y + r.height / 2 - 422) < 1);
    }
    items[2].activity = Array.from({ length: 6 }, (_, n) => ({ id: 'long-reply-' + n, kind: 'reply', created_at: '2026-11-20T12:00:00Z', payload: { author: 'Client', body: 'Long conversation item ' + n + ': ' + 'Additional detail. '.repeat(12) } }));
    items[2].revision++;
    await pin(3).click(); await popup.getByText(/^Long conversation item 5:/).waitFor(); await clearControls();
    assert.ok((await popup.boundingBox()).height < 360, 'Long mobile conversation must fit above the page-note controls');
    await page.screenshot({ path: '/tmp/feedbackpress-page-notes-open-320.png' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('c'); await drop.waitFor(); const mobileZone = await drop.boundingBox(); assert.ok(Math.abs(mobileZone.y + mobileZone.height / 2 - 422) < 1); const mobileStack = await rail.boundingBox(); assert.ok(mobileZone.x >= mobileStack.x + mobileStack.width + 10); assert.ok(mobileZone.x + mobileZone.width <= 308);
    await page.screenshot({ path: '/tmp/feedbackpress-page-notes-320.png' }); await page.keyboard.press('Escape'); assert.equal(await drop.isVisible(), false);
    await page.setViewportSize({ width: 1280, height: 900 });
    items[0].target = { selector: '#target', text: 'Target', x: .5, y: .5, text_change: { original: 'Target', proposed: 'Updated target' } }; items[0].revision++;
    await page.reload(); await pin(1).waitFor();
    await pin(1).hover(); await page.getByRole('tooltip').waitFor();
    assert.ok(!(await page.getByRole('tooltip').textContent()).includes('Direct text edits cannot be moved'));
    const textPin = await center(pin(1)); await page.mouse.move(textPin.x, textPin.y); await page.mouse.down(); await page.mouse.move(textPin.x + 80, textPin.y + 60, { steps: 8 });
    await page.getByRole('tooltip').getByText('Direct text edits cannot be moved', { exact: true }).waitFor();
    assert.equal(await drop.isVisible(), false); assert.deepEqual(await center(pin(1)), textPin);
    assert.equal(await pin(1).evaluate(node => getComputedStyle(node).cursor), 'pointer');
    await page.mouse.up();
    await page.waitForTimeout(550); await page.mouse.move(1100, 600); await pin(1).hover();
    assert.ok(!(await page.getByRole('tooltip').textContent()).includes('Direct text edits cannot be moved'));
    await pin(1).click(); await popup.waitFor();
    assert.equal(items[0].target.selector, '#target'); assert.equal(items[0].target.text_change.proposed, 'Updated target');
    assert.equal(writes, 4); assert.deepEqual(errors, []);
    console.log('PASS Page notes: existing notes, chronological stack, page isolation, fixed scroll position, creation, reload, drag conversion/return, Escape, failed saves, action conversion, unchanged authorship/content, hover shortcuts, left/right room/overlay and 320px layout.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
