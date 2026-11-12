// All HTTP traffic is intercepted; no WordPress or central feedback is changed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', root = path.resolve(__dirname, '..');
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const queryPath = '/?page_id=2&view=a%20b&view=c';
    const items = Array.from({ length: 52 }, (_, n) => ({
      id: `${String(n + 1).padStart(8, '0')}-1111-4111-8111-111111111111`, number: n + 1,
      title: 'Issue ' + (n + 1), body: 'Body', author: 'Reviewer', status: 'todo', revision: 1,
      path: n >= 50 ? queryPath : '/', target: { selector: n === 3 ? '#pin-target' : '#target', x: .5, y: .5 },
      activity: [], files: [], created_at: '2026-11-11T12:00:00Z'
    }));
    const writes = [], operations = new Map(), errors = [];
    await context.route(base + '/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.slice(5);
      if (url.pathname.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(root + '/assets/review.css', 'utf8') });
      if (url.pathname.startsWith('/api/')) {
        if (endpoint === 'issues') {
          if (url.searchParams.get('order') === 'updated') await new Promise(resolve => setTimeout(resolve, 350));
          const found = url.searchParams.has('path') ? items.filter(item => item.path === url.searchParams.get('path')) : items;
          const page = Number(url.searchParams.get('page')) || 1;
          return route.fulfill({ json: { issues: found.slice((page - 1) * 50, page * 50), total: found.length, page } });
        }
        const item = items.find(item => endpoint.startsWith('issues/' + item.id));
        if (item && endpoint.endsWith('/status')) {
          const key = request.headers()['idempotency-key'];
          if (operations.has(key)) return route.fulfill({ json: operations.get(key) });
          const body = request.postDataJSON();
          writes.push({ number: item.number, status: body.status });
          item.status = body.status; item.revision++;
          operations.set(key, structuredClone(item));
          return route.fulfill({ json: item });
        }
        if (item) { await new Promise(resolve => setTimeout(resolve, 200)); return route.fulfill({ json: item }); }
        return route.fulfill({ status: 404, json: { message: 'Missing fixture' } });
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8">
        <input id="native" style="position:absolute;top:10px;left:10px"><div id="editable" contenteditable="true">Editor</div>
        <div id="custom" tabindex="0" role="listbox"></div><div id="target" style="margin:180px;width:300px;height:200px">Target</div>
        <div id="pin-target" style="position:absolute;left:600px;top:200px;width:80px;height:80px">Separate pin</div>
        <script>window.addEventListener('pointermove',event=>window.fixtureMouse={x:event.clientX,y:event.clientY},true);window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',css:'${base}/review.css',nonce:'test',userName:'Reviewer',maxBytes:5242880}</script>
        <script>${fs.readFileSync(root + '/assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const panel = page.getByRole('complementary', { name: 'Issues', exact: true });
    const popup = page.getByRole('region', { name: 'Issue details', exact: true });
    const row = n => panel.locator(`[data-issue="${items[n - 1].id}"]`);
    const selected = n => popup.locator('.popup-header strong').filter({ hasText: new RegExp('^#' + n + '$') }).waitFor();
    const bodyFocus = () => page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    const status = async (key, number, value) => {
      const before = writes.length;
      await page.keyboard.press(key);
      await page.waitForFunction(() => !document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=text]'));
      assert.deepEqual(writes.slice(before), [{ number, status: value }], 'Exactly one issue must change per keypress');
    };
    await page.goto(base); await bodyFocus(); await page.keyboard.press('ArrowDown'); assert.equal(await popup.isVisible(), false);
    await page.keyboard.press('v'); await row(1).waitFor(); await bodyFocus();
    await page.keyboard.press('ArrowDown'); await selected(1);
    await page.keyboard.press('ArrowUp'); await selected(1); // Start boundary.
    await row(3).hover(); await status('3', 3, 'doing'); await selected(1); // Hover does not open it.
    await page.keyboard.press('ArrowDown'); await selected(2);
    await status('4', 2, 'review'); // Stationary mouse over #3 cannot win.
    // Simulate a redraw's pointer event at the unchanged screen coordinates.
    await row(3).hover({ position: { x: 20, y: 20 } });
    const point = await page.evaluate(() => window.fixtureMouse);
    await page.keyboard.press('ArrowUp'); await selected(1);
    await row(3).dispatchEvent('pointerover', { pointerType: 'mouse', clientX: point.x, clientY: point.y });
    await row(3).dispatchEvent('pointermove', { pointerType: 'mouse', clientX: point.x, clientY: point.y });
    await status('5', 1, 'done');
    await row(3).hover({ position: { x: 21, y: 21 } });
    await status('4', 3, 'review'); // A real mouse movement takes control back.
    await status('1', 3, 'todo'); await status('5', 3, 'done');
    const count = writes.length; await page.keyboard.press('5'); assert.equal(writes.length, count);
    // Clicking an issue takes precedence over an earlier hovered target.
    await row(2).locator('.issue-open').click(); await selected(2); await status('3', 2, 'doing');
    const refreshing = page.waitForRequest(request => new URL(request.url()).searchParams.get('order') === 'updated');
    await panel.getByLabel('Order issues').selectOption('updated'); await refreshing;
    await page.keyboard.press('ArrowDown'); await selected(3); // Known rows remain usable during refresh.
    await page.keyboard.press('ArrowUp'); await selected(2);
    await panel.getByLabel('Order issues').selectOption('number');
    for (const field of [page.locator('#native'), page.locator('#editable'), page.locator('#custom'), popup.getByRole('textbox', { name: 'Reply', exact: true })]) {
      await field.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('1'); await selected(2);
    }
    assert.equal(writes.length, count + 1, 'Typing and native/custom navigation must not write');
    await bodyFocus();
    for (const key of ['Shift+ArrowDown', 'Control+ArrowDown', 'Alt+ArrowUp', 'Meta+4']) await page.keyboard.press(key);
    await page.evaluate(() => {
      for (const options of [{ key: 'ArrowDown', repeat: true }, { key: 'ArrowDown', isComposing: true }, { key: '4', repeat: true }])
        document.body.dispatchEvent(new KeyboardEvent('keydown', { ...options, bubbles: true, composed: true }));
    });
    await selected(2); assert.equal(writes.length, count + 1);
    // Mouse-only shortcuts work on passive pins, but Escape clears stale targeting.
    await page.keyboard.press('Escape'); await page.keyboard.press('2'); assert.equal(writes.length, count + 1);
    const pin = page.locator(`[data-pin-issue="${items[3].id}"]`);
    await pin.hover(); await status('3', 4, 'doing'); assert.equal(await popup.isVisible(), false);
    await page.mouse.move(5, 5); await page.keyboard.press('3'); assert.equal(writes.length, count + 2);
    // Up from an unselected list starts at its last issue. Arrows cross list and real query-page boundaries.
    await bodyFocus(); await page.keyboard.press('v'); await row(50).waitFor({ state: 'attached' });
    await page.keyboard.press('ArrowUp'); await selected(50);
    await page.keyboard.press('ArrowDown'); await page.waitForURL(base + queryPath + '#feedbackpress=' + items[50].id); await selected(51);
    const carriedPointer = await page.evaluate(base => JSON.parse(sessionStorage.getItem('feedbackpress-shared-cache:' + base + '::Reviewer')).view.pointer, base);
    await row(52).dispatchEvent('pointermove', { pointerType: 'mouse', clientX: carriedPointer.x, clientY: carriedPointer.y });
    await status('3', 51, 'doing'); // A stationary pointer remains stationary across a real document change.
    await bodyFocus(); await page.keyboard.press('ArrowDown'); await selected(52);
    await page.keyboard.press('ArrowDown'); await selected(52); // End boundary.
    await page.keyboard.press('ArrowUp'); await selected(51);
    await page.keyboard.press('ArrowUp'); await page.waitForURL(base + '/#feedbackpress=' + items[49].id); await selected(50);
    await page.setViewportSize({ width: 390, height: 844 }); await bodyFocus();
    await page.keyboard.press('ArrowUp'); await selected(49); await status('4', 49, 'review');
    assert.deepEqual(errors, []);
    console.log('PASS Up/Down start/bounds/pagination/query-page/mobile navigation; all status digits target exactly one last-used mouse/keyboard issue; stationary/redrawn pointers cannot steal it; typing/modifier/repeat/composition guards; hover-only pins and Escape. No real feedback changed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
