// Intercepted gateway: no site content, service calls or email.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', owner = 'owner', id = '11111111-1111-4111-8111-111111111111', mine = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333', noteId = '44444444-4444-4444-8444-444444444444';
    const issue = { id, number: 1, title: 'Original title', body: 'Original description with https://feedbackpress.test/destination/', author: 'Reviewer', author_id: owner, owner_id: owner, status: 'todo', revision: 1, edit_revision: 1, path: '/', created_at: '2026-11-19T12:00:00Z', target: { selector: '#target', x: .5, y: .5 }, files: [], activity: [
      { id: mine, kind: 'reply', created_at: '2026-11-19T12:01:00Z', payload: { author: 'Reviewer', author_id: owner, owner_id: owner, body: 'My reply', edit_revision: 1 } },
      { id: other, kind: 'reply', created_at: '2026-11-19T12:02:00Z', payload: { author: 'Reviewer', author_id: owner, owner_id: 'other', body: 'Someone else owns this reply', edit_revision: 1 } }
    ] };
    const note = { id: noteId, issue_id: id, body: 'Private reminder', author_kind: 'human', author_name: 'Reviewer', revision: 1, created_at: '2026-11-19T12:03:00Z' };
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    let failure = 0, writes = [], hold, release, privateWrites = 0, privateHold, privateRelease;
    await context.route(base + '/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      const respond = (json, status = 200) => route.fulfill({ status, headers: { 'X-FeedbackPress-Actor-Id': owner }, json });
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (path.endsWith('.woff2')) return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (path === '/api/mentions') return respond({ people: [{ id: 'colleague', name: 'Colleague' }], review_site: false });
      if (path.endsWith('/notes/' + noteId)) {
        const data = req.postDataJSON(); privateWrites++; if (privateHold) await privateHold; assert.equal(data.revision, note.revision); note.body = data.body; note.revision++; return respond(note);
      }
      if (path.endsWith('/notes')) return respond({ notes: [note] });
      if (path.includes('/comments/') && path.endsWith('/manage')) {
        const data = req.postDataJSON(), cid = path.split('/')[5]; writes.push(data);
        if (hold) await hold;
        if (failure) return respond({ message: failure === 409 ? 'Newer edit exists' : 'Connection failed' }, failure);
        assert.equal(data.revision, issue.revision);
        const item = cid === id ? issue : issue.activity.find(item => item.id === cid).payload;
        assert.equal(item.owner_id, owner); item.body = data.body; if (data.title !== undefined) item.title = data.title;
        issue.revision++; issue.edit_revision = issue.revision; issue.activity.forEach(event => { event.payload.edit_revision = issue.revision; }); return respond(issue);
      }
      if (path === '/api/issues') return respond({ issues: [issue], total: 1, page: 1 });
      if (path.startsWith('/api/')) return respond(issue);
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="min-height:2400px"><div id="target" style="margin:200px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',userName:'Reviewer',authorId:'owner',privateNotes:true,nonce:'fixture'}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/#feedbackpress=' + id);
    const popup = page.getByRole('region', { name: 'Issue details', exact: true }), original = popup.locator(`[data-comment="${id}"]`), ownReply = popup.locator(`[data-comment="${mine}"]`), otherReply = popup.locator(`[data-comment="${other}"]`), privateRow = popup.locator(`[data-note="${noteId}"]`);
    const editor = () => popup.locator('[data-edit-comment]'), title = popup.getByRole('textbox', { name: 'Edit issue title', exact: true }), body = popup.getByRole('textbox', { name: 'Edit comment', exact: true });
    const idle = () => page.waitForFunction(() => !document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=text]'));
    await privateRow.waitFor(); await popup.getByRole('textbox', { name: 'Reply', exact: true }).fill('Unsent reply stays here');
    const originalBody = issue.body;
    const bodyColor = await original.locator('p.comment').evaluate(node => getComputedStyle(node).color);
    const titleColor = await original.locator('.issue-title').evaluate(node => getComputedStyle(node).color);

    await page.mouse.move(200, 800); await page.mouse.wheel(0, 700); await page.waitForFunction(() => scrollY > 500); const offscreenScroll = await page.evaluate(() => scrollY);
    await original.locator('.issue-title').dblclick(); await title.waitFor(); assert.equal(await page.evaluate(() => scrollY), offscreenScroll, 'Double-click editing must not reveal an offscreen marker first'); assert.equal(await body.count(), 0); assert.equal(await original.locator('p.comment').textContent(), originalBody);
    assert.equal(await title.evaluate(node => node === node.getRootNode().activeElement), true);
    assert.equal(await editor().locator('button').count(), 0);
    assert.equal(await title.evaluate(node => getComputedStyle(node).color), titleColor);
    const shortTitleHeight = (await title.boundingBox()).height;
    await title.fill('A longer title that should wrap naturally across multiple lines while it is edited inside this narrow ticket');
    assert.ok((await title.boundingBox()).height > shortTitleHeight);
    await title.fill('Original title'); assert.equal((await title.boundingBox()).height, shortTitleHeight);

    await title.fill('Cancelled after focus drift'); await popup.getByRole('textbox', { name: 'Reply', exact: true }).focus(); await page.keyboard.press('Escape');
    assert.equal(await editor().count(), 0); assert.equal(await popup.isVisible(), true); assert.equal(issue.title, 'Original title'); assert.equal(writes.length, 0); assert.equal(await page.getByRole('complementary', { name: 'Issues', exact: true }).isVisible(), true);
    await original.locator('.issue-title').dblclick(); await title.click(); assert.equal(await editor().count(), 1);
    await page.mouse.click(200, 800); assert.equal(await editor().count(), 1, 'Outside the ticket must not save');
    await title.press('Escape'); assert.equal(writes.length, 0);
    await original.locator('.issue-title').dblclick(); await original.locator('p.comment').click({ position: { x: 30, y: 8 } });
    assert.equal(await editor().count(), 0); assert.equal(writes.length, 0, 'Unchanged field must not write');
    await original.locator('.issue-title').dblclick();
    await title.fill(''); await popup.locator('.popup-header').click({ position: { x: 3, y: 3 } });
    assert.equal(await title.count(), 1); assert.equal(await title.evaluate(node => node === node.getRootNode().activeElement), true); assert.equal(writes.length, 0); await title.press('Escape');
    await original.locator('.issue-title').dblclick(); await title.fill('Title only changed'); hold = new Promise(resolve => { release = resolve; });
    await original.locator('p.comment').click({ position: { x: 30, y: 8 } }); await original.locator('.issue-title').filter({ hasText: 'Title only changed' }).waitFor();
    assert.equal(await original.locator('p.comment').textContent(), originalBody, 'Optimistic title save must retain description');
    release(); hold = null; await idle(); assert.equal(issue.title, 'Title only changed'); assert.equal(issue.body, originalBody); assert.equal(issue.activity[0].payload.body, 'My reply');
    // Native links stay links; their double-click event never starts editing.
    const link = original.locator('a'); await link.dispatchEvent('dblclick'); assert.equal(await editor().count(), 0); assert.equal(await link.getAttribute('href'), base + '/destination/');
    await original.locator('.issue-title').dblclick(); const opened = context.waitForEvent('page'); await link.click(); const linkedPage = await opened; await linkedPage.waitForURL(base + '/destination/'); await linkedPage.close(); assert.equal(await editor().count(), 0);
    // Double-click the plain part of a linked description.
    await original.locator('p.comment').dblclick({ position: { x: 30, y: 8 } }); await body.waitFor(); assert.equal(await title.count(), 0); assert.equal(await original.locator('.issue-title').textContent(), 'Title only changed');
    assert.equal(await body.evaluate(node => getComputedStyle(node).color), bodyColor);
    await body.fill('A long inline paragraph with words that wrap. '.repeat(25));
    const expandedHeight = (await body.boundingBox()).height;
    assert.ok(await body.evaluate(node => node.scrollHeight <= node.clientHeight + 1));
    await body.fill('Short note'); assert.ok((await body.boundingBox()).height < expandedHeight);
    assert.equal((await body.boundingBox()).height, 26);
    // Exercise the fallback without native field sizing.
    await page.evaluate(() => { const original = CSS.supports.bind(CSS); CSS.supports = (...args) => args[0] === 'field-sizing' ? false : original(...args); const style = document.createElement('style'); style.textContent = '[data-inline-editor] textarea { field-sizing: fixed !important; }'; document.querySelector('#feedbackpress-root').shadowRoot.append(style); });
    await body.fill('Fallback wrapping paragraph. '.repeat(25));
    assert.ok(await body.evaluate(node => node.scrollHeight <= node.clientHeight + 1));
    await body.fill('Short again'); assert.equal((await body.boundingBox()).height, 26);
    await body.fill('@Co'); await page.getByRole('option', { name: 'Colleague', exact: true }).click(); assert.equal(await editor().count(), 1); assert.equal(writes.length, 1);
    await body.fill('@Co'); await page.getByRole('option', { name: 'Colleague', exact: true }).waitFor(); await body.press('Escape'); assert.equal(await editor().count(), 0); assert.equal(await popup.isVisible(), true);
    await original.locator('p.comment').dblclick({ position: { x: 30, y: 8 } }); await body.fill('Body only changed'); await body.press('Control+Enter'); await idle(); assert.equal(issue.body, 'Body only changed'); assert.equal(issue.title, 'Title only changed');
    await ownReply.locator('p.comment').dblclick(); await body.fill('Cancelled reply'); await body.press('Escape'); assert.equal(await editor().count(), 0); assert.equal(issue.activity[0].payload.body, 'My reply');
    await otherReply.locator('p.comment').dblclick(); assert.equal(await editor().count(), 0, 'Displayed author cannot override immutable ownership');
    await ownReply.locator('p.comment').dblclick(); await body.fill('Reply changed'); await popup.locator('.popup-header').click({ position: { x: 3, y: 3 } }); await idle(); assert.equal(issue.activity[0].payload.body, 'Reply changed'); assert.equal(issue.activity[1].payload.body, 'Someone else owns this reply');
    await privateRow.locator('p.comment').dblclick(); const privateBody = popup.getByRole('textbox', { name: 'Edit private note', exact: true }); await privateBody.fill('Cancelled private'); await privateBody.press('Escape'); assert.equal(note.body, 'Private reminder'); assert.equal(await popup.locator('[data-private-edit]').count(), 0);
    await privateRow.locator('p.comment').dblclick(); assert.equal(await popup.locator('[data-private-edit] button').count(), 0);
    await popup.locator('.popup-header').click({ position: { x: 3, y: 3 } }); assert.equal(privateWrites, 0); assert.equal(await popup.locator('[data-private-edit]').count(), 0);
    await privateRow.locator('p.comment').dblclick();
    await privateBody.fill('Private changed'); privateHold = new Promise(resolve => { privateRelease = resolve; });
    await popup.locator('.popup-header').click({ position: { x: 3, y: 3 } }); await popup.locator('.popup-header').click({ position: { x: 3, y: 3 } });
    assert.equal(await privateBody.isDisabled(), true); privateRelease(); privateHold = null; await privateRow.locator('p.comment').filter({ hasText: 'Private changed' }).waitFor(); assert.equal(note.body, 'Private changed'); assert.equal(privateWrites, 1);
    // Existing menu remains the full, discoverable editor.
    await popup.getByRole('button', { name: 'Actions for issue', exact: true }).click(); await popup.locator('.note-actions:popover-open').getByRole('button', { name: 'Edit', exact: true }).click(); await title.waitFor(); await body.waitFor(); await editor().getByRole('button', { name: 'Cancel', exact: true }).click();
    for (const status of [500, 409]) {
      await original.locator('.issue-title').dblclick(); await title.fill('Recoverable title ' + status); failure = status;
      await original.locator('p.comment').click(); await page.getByText(status === 409 ? 'Newer edit exists' : 'Connection failed', { exact: true }).waitFor(); failure = 0;
      await page.getByRole('button', { name: 'Restore draft', exact: true }).click(); assert.equal(await title.inputValue(), 'Recoverable title ' + status); assert.equal(await body.inputValue(), 'Body only changed');
      await editor().getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    assert.equal(await popup.getByRole('textbox', { name: 'Reply', exact: true }).inputValue(), 'Unsent reply stays here');
    await original.locator('.issue-title').dblclick(); await page.screenshot({ path: '/tmp/feedbackpress-inline-title-desktop.png' });
    await page.setViewportSize({ width: 320, height: 844 }); assert.ok(await popup.evaluate(node => node.scrollWidth <= node.clientWidth)); await page.screenshot({ path: '/tmp/feedbackpress-inline-title-320.png' }); await title.press('Escape'); assert.equal(await popup.isVisible(), true);
    await original.locator('p.comment').dblclick(); assert.equal(await title.count(), 0); await page.screenshot({ path: '/tmp/feedbackpress-inline-body-320.png' }); await body.press('Escape');
    await original.locator('time.comment-date').first().click(); await page.waitForFunction(() => scrollY < 500);
    // Suggested wording keeps its specialized comparison and existing menu editor.
    issue.target.text_change = { original: 'Old wording', proposed: 'Proposed wording' }; issue.revision++; issue.edit_revision = issue.revision;
    await page.reload(); await popup.locator('.text-change-view').waitFor(); await original.locator('p.comment').dblclick(); await body.waitFor(); assert.equal(await popup.getByRole('textbox', { name: 'Edit suggested wording', exact: true }).count(), 0); await body.fill('Suggestion context changed'); await body.press('Control+Enter'); await idle(); assert.deepEqual(issue.target.text_change, { original: 'Old wording', proposed: 'Proposed wording' });
    await original.locator('p.comment').dblclick(); await body.fill('Uncommitted hidden draft');
    await page.evaluate(() => { document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-popup').hidden = true; document.activeElement.blur(); });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Leave feedback', exact: true }).click(); await page.locator('#target').click();
    const composer = page.getByRole('region', { name: 'New feedback', exact: true }); await composer.waitFor();
    const newTitle = composer.getByRole('textbox', { name: 'Issue title', exact: true }); assert.equal(await newTitle.inputValue(), '');
    assert.equal(await composer.locator('[name=body]').inputValue(), ''); assert.equal(await composer.locator('.attached-file').count(), 0);
    await newTitle.press('Escape'); assert.equal(await composer.isVisible(), false); assert.equal(await popup.isVisible(), false);
    assert.equal(await page.getByRole('complementary', { name: 'Issues', exact: true }).isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'View issues', exact: true }).getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Escape'); assert.deepEqual(errors, []); assert.equal(writes.length, 6);
    console.log('PASS Double-click title/body/reply/private edits, separate fields, native links, ownership, menu fallback, optimistic preservation, inside-ticket autosave, no action buttons/no-op, focus-drift Escape, failure/conflict recovery, unsent reply preservation, text suggestions and 320px layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
