// Intercepted gateway: no WordPress content or service writes.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'America/Chicago', reducedMotion: 'reduce' });
    const issue = { id: '11111111-1111-4111-8111-111111111111', number: 1, body: 'Original ticket', author: 'Original author', status: 'done', completed_at: '2026-11-12T17:55:00Z', created_at: '2026-11-11T23:00:00Z', revision: 1, path: '/', files: [], target: { selector: 'body', x: .5, y: .5 }, activity: [{ id: '22222222-2222-4222-8222-222222222222', kind: 'reply', created_at: '2026-11-12T17:30:00Z', payload: { body: 'Verified by someone else', author: 'Reviewer' } }] };
    let holdStatus, releaseStatus;
    await context.route(base + '/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (path.endsWith('/status')) {
        if (holdStatus) await holdStatus;
        issue.status = request.postDataJSON().status;
        issue.completed_at = issue.status === 'done' ? '2026-11-13T05:59:00Z' : null;
        issue.revision++;
      }
      if (path === '/api/issues') return route.fulfill({ json: { issues: [issue], total: 1, page: 1 } });
      if (path.startsWith('/api/')) return route.fulfill({ json: issue });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Reviewer'}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-11-12T18:00:00Z') });
    await page.clock.setFixedTime(new Date('2026-11-12T18:00:00Z'));
    await page.goto(base + '/#feedbackpress=' + issue.id);
    const popup = page.getByRole('region', { name: 'Issue details', exact: true }), closed = popup.locator('.comment-closed');
    await closed.waitFor();
    assert.equal(await closed.textContent(), 'Closed 5 minutes ago');
    assert.equal(await closed.locator('time').getAttribute('datetime'), issue.completed_at);
    assert.ok((await closed.locator('time').getAttribute('data-tooltip')).includes('2026'));
    assert.equal(await popup.locator('.thread-comment').nth(1).locator('.comment-closed').count(), 0);
    const author = popup.locator('.comment-author').first();
    assert.ok((await closed.boundingBox()).x > (await author.boundingBox()).x + (await author.boundingBox()).width);
    await page.clock.setFixedTime(new Date('2026-11-13T06:00:01Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.match(await closed.textContent(), /^Closed Nov 12.*11:55/);
    assert.ok(!(await closed.textContent()).includes('2026'));
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await popup.evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await page.screenshot({ path: '/tmp/feedbackpress-closed-time-320.png' });
    holdStatus = new Promise(resolve => { releaseStatus = resolve; });
    await popup.locator('[data-status-action="todo"]').click();
    await closed.waitFor({ state: 'detached' }); // Optimistic reopening must not keep an old closure date.
    releaseStatus(); holdStatus = null;
    await page.waitForFunction(() => !document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=text]'));
    await popup.locator('[data-status-action="done"]').click();
    await closed.waitFor();
    assert.equal(await closed.locator('time').getAttribute('datetime'), '2026-11-13T05:59:00Z');
    assert.equal(await popup.locator('.comment-author').first().textContent(), 'Original author');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: '/tmp/feedbackpress-closed-time-desktop.png' });
    for (const value of [null, 'invalid']) {
      issue.completed_at = value; issue.revision++;
      await page.reload(); await popup.getByText('Original ticket', { exact: true }).waitFor();
      assert.equal(await closed.count(), 0);
    }
    assert.deepEqual(errors, []);
    console.log('PASS Closed time: original byline only, trailing alignment, shared formatter/tooltip/refresh, 320px layout, immediate reopening, new completion time and absent/invalid timestamps.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
