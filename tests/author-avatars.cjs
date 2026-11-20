// Synthetic review UI and Gravatar responses only; no customer or provider requests.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', owner = 'a'.repeat(64), other = 'b'.repeat(64), third = 'c'.repeat(64);
    const id = '11111111-1111-4111-8111-111111111111';
    const issue = { id, number: 1, title: 'Author identity', body: 'A shared ticket', author: 'Alex', author_id: owner, owner_id: other, status: 'review', revision: '1', path: '/', created_at: '2026-11-19T12:00:00Z', target: { selector: '#target', x: .5, y: .5 }, files: [], activity: [other, third, owner].map((author_id, index) => ({ id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, kind: 'reply', created_at: '2026-11-19T12:00:01Z', payload: { author: index === 2 ? 'Alex' : 'Sam', author_id, owner_id: other, body: 'Reply ' + index, visibility: index === 1 ? 'private' : 'shared' } })) };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const requests = [];
    let offline = false;
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.gravatar.com') {
        requests.push(url);
        if (offline) return route.abort();
        // One photo and two distinct generated icons stand in for Gravatar's response.
        const color = url.pathname.includes(owner) ? '#bf784b' : url.pathname.includes(other) ? '#357f83' : '#805996';
        return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${color}"/></svg>` });
      }
      if (url.pathname.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync('assets/review.css', 'utf8') });
      if (url.pathname.endsWith('.woff2')) return route.fulfill({ body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
      if (url.pathname.startsWith('/agents/')) return route.fulfill({ contentType: 'image/svg+xml', body: fs.readFileSync('assets' + url.pathname) });
      if (url.pathname.endsWith('/notes')) return route.fulfill({ json: { notes: [
        { id: '33333333-3333-4333-8333-333333333333', author_name: 'Alex', author_kind: 'human', body: 'Private note', revision: 1 },
        ...['Codex', 'Claude Code', 'Other agent'].map((agent, i) => ({ id: 'agent-' + i, author_name: 'Alex', author_kind: 'agent', agent, body: agent + ' private note', revision: 1 }))
      ] } });
      if (url.pathname.endsWith('/reply-counts')) return route.fulfill({ json: { counts: [] } });
      if (url.pathname === '/api/issues' || url.pathname === '/api/pins') return route.fulfill({ json: { issues: [issue], total: 1, page: 1 } });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: issue });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:150px;height:400px">Page</div><script>window.FeedbackPressConfig=${JSON.stringify({ home: base, api: base + '/api/', css: base + '/review.css?ver=author-cues-test', userName: 'Alex', authorId: owner, nonce: 'test', privateNotes: true })}</script><script>${fs.readFileSync('assets/review.js', 'utf8')}</script>` });
    });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button', { name: /Issue 1, Review/ }).click();
    const popup = page.getByRole('region', { name: 'Issue details' });
    await popup.locator('.private-note').first().waitFor();
    await popup.locator('.author-avatar img').first().evaluate(img => img.decode());
    assert.equal(await popup.locator('.author-self').count(), 0);
    assert.equal(await popup.locator('[data-self]').count(), 3); // Root, own reply and human note; attribution, not immutable ownership.
    assert.equal(await popup.getByText('You', { exact: true }).count(), 0);
    assert.equal(await popup.getByText(/Only you/).count(), 0);
    assert.equal(await popup.locator('.agent-avatar').count(), 3);
    assert.equal(await popup.locator('.agent-avatar img[src*="gravatar"]').count(), 0);
    for (const brand of ['codex', 'claude']) {
      const avatar = popup.locator(`.agent-avatar[data-agent="${brand}"]`);
      assert.equal(await avatar.locator('img').getAttribute('src'), base + '/agents/' + brand + '.svg?ver=author-cues-test');
      await avatar.locator('img').evaluate(img => img.decode());
    }
    assert.equal(await popup.locator('.private-note[data-self] .agent-avatar').count(), 0);
    assert.equal(await popup.locator('.agent-avatar[data-agent="agent"] svg').count(), 1);
    const alignment = await popup.locator('.thread-comment').evaluateAll(nodes => nodes.map(n => n.querySelector('.comment-copy').getBoundingClientRect().x - n.getBoundingClientRect().x));
    assert(alignment.every(x => x === alignment[0]), JSON.stringify(alignment));
    const marker = await popup.locator('[data-self]').first().evaluate(n => ({ width: getComputedStyle(n, '::before').width, position: getComputedStyle(n, '::before').position, top: getComputedStyle(n, '::before').top, bottom: getComputedStyle(n, '::before').bottom, color: getComputedStyle(n, '::before').backgroundColor }));
    assert.deepEqual(marker, { width: '3px', position: 'absolute', top: '0px', bottom: '0px', color: 'rgb(59, 139, 99)' });
    const row = page.locator('.issue-row[data-self]').first();
    const geometry = await row.evaluate(n => { const box = n.querySelector('.row-content').getBoundingClientRect(); n.removeAttribute('data-self'); const after = n.querySelector('.row-content').getBoundingClientRect(); n.setAttribute('data-self', ''); return [box.x, box.width, after.x, after.width]; });
    assert.equal(geometry[0], geometry[2]); assert.equal(geometry[1], geometry[3]);
    assert.equal(await row.locator('.row-content').evaluate(n => getComputedStyle(n, '::before').content), 'none');
    assert.equal(await popup.locator('.author-avatar').count(), 8);
    const rootAvatar = popup.locator(`[data-comment="${id}"] .author-avatar`);
    const ownReply = popup.locator('[data-comment="22222222-2222-4222-8222-000000000002"] .author-avatar');
    assert.equal(await rootAvatar.locator('img').getAttribute('src'), await ownReply.locator('img').getAttribute('src'));
    const patterns = await popup.locator('[data-comment] .author-avatar svg').evaluateAll(nodes => nodes.slice(0, 3).map(n => n.outerHTML));
    assert.equal(new Set(patterns).size, 3); // Same display name, different email identities.
    for (const url of requests) {
      assert.equal(url.searchParams.get('d'), 'identicon');
      assert.equal(url.searchParams.get('r'), 'g');
      assert.match(url.pathname, /^\/avatar\/[a-f0-9]{64}$/);
    }
    assert(requests.length >= 3);
    assert.equal(await rootAvatar.locator('img').getAttribute('referrerpolicy'), 'no-referrer');
    const privateNote = popup.locator('.private-note').first();
    assert.equal(await privateNote.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(255, 249, 223)');
    assert.equal(await popup.evaluate(n => getComputedStyle(n).getPropertyValue('--fp-review-ink').trim()), '#6f4396');
    const assertAvatarAlignment = async () => {
      const metrics = await popup.locator('.comment-byline').evaluateAll(nodes => nodes.map(n => {
        const avatar = n.querySelector('.author-avatar'), author = n.querySelector('.comment-author');
        const a = avatar.getBoundingClientRect(), b = author.getBoundingClientRect();
        return { agent: avatar.classList.contains('agent-avatar'), width: a.width, height: a.height, radius: getComputedStyle(avatar).borderRadius, offset: Math.abs(a.y + a.height / 2 - b.y - b.height / 2) };
      }));
      assert(metrics.every(m => m.width === 18 && m.height === 18 && m.radius === (m.agent ? '0px' : '50%') && m.offset < 1), JSON.stringify(metrics));
    };
    await assertAvatarAlignment();
    const codex = popup.locator('.agent-avatar[data-agent="codex"]');
    assert.equal(await codex.evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await codex.locator('img').evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await codex.locator('img').evaluate(n => getComputedStyle(n).filter), 'none');
    assert.equal(await codex.locator('img').evaluate(n => getComputedStyle(n).objectFit), 'contain');
    await page.screenshot({ path: '/tmp/feedbackpress-avatars-light.png' });
    await page.locator('#feedbackpress-root').evaluate(n => n.dataset.appearance = 'dark');
    assert.equal(await privateNote.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(51, 46, 25)');
    assert.equal(await codex.locator('img').evaluate(n => getComputedStyle(n).filter), 'invert(1)');
    assert.equal(await popup.locator('[data-self]').first().evaluate(n => getComputedStyle(n, '::before').backgroundColor), 'rgb(107, 181, 142)');
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await popup.evaluate(n => n.scrollWidth <= n.clientWidth), true);
    await assertAvatarAlignment();
    await page.screenshot({ path: '/tmp/feedbackpress-avatars-dark-mobile.png' });
    offline = true;
    await page.reload();
    await page.getByRole('region', { name: 'Issue details' }).waitFor();
    // Exercise the actual failure handler even if Chrome reused a cached response.
    await page.locator('.author-avatar img').evaluateAll(nodes => nodes.forEach(n => n.dispatchEvent(new Event('error'))));
    assert.equal(await popup.locator('.author-avatar img').count(), 0);
    assert.equal(await popup.locator('.author-avatar svg').count(), 8);
    assert.deepEqual(errors, []);
    console.log('PASS stable per-person avatars, identicon request defaults, local offline fallbacks, full-height green ticket-only bars without layout shifts, transparent theme-aware agent icons without owner photos, concise private labels, private yellow light/dark, and 320px layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
