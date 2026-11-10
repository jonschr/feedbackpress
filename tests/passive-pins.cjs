// Requires Playwright and installed Chrome. All API writes use intercepted fixtures.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', root = path.resolve(__dirname, '..');
    async function setup({ delayLists = false, delayCreate = false } = {}) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const items = ['todo', 'done', 'review', 'doing'].map((status, n) => ({ id: `${n + 1}1111111-1111-4111-8111-111111111111`, number: String(n + 1), status, author: 'Reviewer', body: status + ' issue', path: '/test/', target: { selector: '#target' + n, text: status, x: .5, y: .5 }, revision: '1', activity: [], files: [], conflict: false, created_at: '2026-11-05T12:00:00Z' }));
      let releaseLists, releaseCreate, releaseUpload;
      const listGate = delayLists ? new Promise(resolve => releaseLists = resolve) : Promise.resolve();
      const createGate = delayCreate ? new Promise(resolve => releaseCreate = resolve) : Promise.resolve();
      let uploadGate = Promise.resolve(), failLists = false;
      await ctx.route(base + '/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        if (url.pathname === '/review.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(root, 'assets/review.css'), 'utf8') });
        if (url.pathname === '/api/issues' && method === 'GET') {
          await listGate;
          if (failLists) return route.fulfill({ status: 503, json: { message: 'Test list temporarily unavailable' } });
          const q = url.searchParams, terms = (q.get('search') || '').toLowerCase().split(/\s+/).filter(Boolean);
          const found = items.filter(i => (!q.get('path') || i.path === q.get('path')) && (!q.get('status') || q.get('status').split(',').includes(i.status)) && terms.every(t => i.body.toLowerCase().includes(t)));
          return route.fulfill({ json: { issues: found, total: found.length, page: 1, order: q.get('order') } });
        }
        if (url.pathname === '/api/issues' && method === 'POST') {
          await createGate;
          const n = items.length + 1, item = { ...items[0], ...route.request().postDataJSON(), id: `${n}1111111-1111-4111-8111-111111111111`, number: String(n), status: 'todo' };
          items.push(item); return route.fulfill({ status: 201, json: item });
        }
        if (url.pathname.endsWith('/files')) { await uploadGate; return route.fulfill({ json: items.at(-1) }); }
        if (url.pathname.startsWith('/api/issues/')) return route.fulfill({ json: items.find(i => url.pathname.endsWith(i.id)) });
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f0e8"><button id="page-action" onclick="window.pageClicks++" style="position:fixed;left:10px;top:10px">Page action</button><div style="height:200px"></div>${items.slice(0,4).map((i,n) => `<div id="target${n}" style="margin-left:40px;width:240px;height:180px">${i.body}</div>`).join('')}<div style="height:700px"></div><script>window.pageClicks=0;window.html2canvas=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;return canvas};window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',nonce:'test',userName:'Tester',css:'${base}/review.css',maxBytes:5242880};</script><script>${fs.readFileSync(path.join(root, 'assets/review.js'), 'utf8')}</script></body></html>` });
      });
      const page = await ctx.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/test/');
      const host = page.locator('#feedbackpress-root'), panel = page.getByRole('complementary', { name: 'Issues', exact: true }), composer = page.getByRole('region', { name: 'New feedback', exact: true });
      const pins = async expected => page.waitForFunction(expected => {
        const r = document.querySelector('#feedbackpress-root').shadowRoot;
        return JSON.stringify([...r.querySelectorAll('.pins .pin')].map(n => n.textContent).sort()) === JSON.stringify(expected.map(String).sort());
      }, expected);
      const begin = () => page.getByRole('button', { name: 'Leave feedback', exact: true }).click();
      let drops = 0;
      const submit = async body => { await page.mouse.click(220, 250 + 30 * drops++); await composer.waitFor(); await composer.getByRole('textbox', { name: 'Issue title', exact: true }).fill('Test issue title'); await composer.getByRole('textbox', { name: 'What needs to change?', exact: true }).fill(body); await composer.getByRole('button', { name: 'Submit feedback', exact: true }).click(); };
      const finished = () => page.waitForFunction(() => { const r = document.querySelector('#feedbackpress-root').shadowRoot; return r.querySelector('.composer:not(.issue-popup)').hidden && !r.querySelector('.launcher button').disabled; });
      return { ctx, page, errors, host, panel, composer, pins, begin, submit, finished, items, releaseLists: () => releaseLists(), releaseCreate: () => releaseCreate(), holdUpload: () => { uploadGate = new Promise(resolve => releaseUpload = resolve); }, releaseUpload: () => releaseUpload(), failLists: value => failLists = value };
    }
    const t = await setup(), { page, panel, composer } = t;
    await t.pins([1, 3]); assert.equal(await panel.isVisible(), false);
    await t.begin(); await t.pins([1, 3]);
    t.holdUpload(); await t.submit('matching new issue'); await t.pins([1, 3, 5]); assert.equal(await composer.isVisible(), true); assert.equal(await t.host.locator('.draft-pin').isVisible(), false);
    t.failLists(true); t.releaseUpload(); await t.finished(); await t.pins([1, 3, 5]); assert.equal(await panel.isVisible(), false); t.failLists(false);
    await t.submit('matching second issue'); await t.finished(); await t.pins([1, 3, 5, 6]);
    await page.keyboard.press('Escape'); await t.pins([1, 3, 5, 6]);
    await t.host.locator('.pins .pin').filter({ hasText: /^3$/ }).click(); await page.getByRole('region', { name: 'Issue details', exact: true }).waitFor(); await page.keyboard.press('Escape'); await t.pins([1, 3, 5, 6]);
    await page.getByRole('button', { name: 'View issues', exact: true }).click();
    const filter = panel.getByRole('button', { name: 'Filter statuses', exact: true });
    await filter.click(); await panel.getByRole('checkbox', { name: 'To do', exact: true }).uncheck(); await panel.getByRole('checkbox', { name: 'Review', exact: true }).uncheck(); await panel.getByRole('checkbox', { name: 'Done', exact: true }).check(); await page.keyboard.press('Escape'); await t.pins([2]);
    await panel.getByRole('button', { name: 'Dismiss issues', exact: true }).click(); await t.pins([2]); await t.begin(); await t.pins([2]); await t.submit('Hidden by Done-only filter'); await t.finished(); await t.pins([2]); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'View issues', exact: true }).click(); await filter.click(); await panel.getByRole('checkbox', { name: 'Done', exact: true }).uncheck(); await page.keyboard.press('Escape'); await t.pins([]); await panel.getByRole('button', { name: 'Dismiss issues', exact: true }).click(); await page.reload(); await t.pins([]);
    await page.getByRole('button', { name: 'View issues', exact: true }).click(); await filter.click(); await panel.getByRole('checkbox', { name: 'To do', exact: true }).check(); await panel.getByRole('checkbox', { name: 'Review', exact: true }).check(); await page.keyboard.press('Escape'); await panel.getByRole('searchbox', { name: 'Search issues and replies', exact: true }).fill('matching'); await t.pins([5, 6]); await panel.getByRole('button', { name: 'Dismiss issues', exact: true }).click(); await t.pins([5, 6]);
    await t.begin(); await t.submit('matching third issue'); await t.finished(); await t.pins([5, 6, 8]); await t.submit('unrelated request'); await t.finished(); await t.pins([5, 6, 8]); await page.keyboard.press('Escape');
    assert.deepEqual(t.errors, []); await t.ctx.close();
    const initial = await setup({ delayLists: true }); await initial.begin(); await initial.page.keyboard.press('Escape'); initial.releaseLists(); await initial.pins([1, 3]); assert.equal(await initial.panel.isVisible(), false); await initial.ctx.close();
    const late = await setup({ delayCreate: true }); await late.pins([1, 3]); await late.begin(); await late.submit('Saved after Escape'); await late.page.keyboard.press('Escape'); late.releaseCreate(); await late.finished(); await late.pins([1, 3, 5]); assert.equal(await late.composer.isVisible(), false); assert.equal(await late.panel.isVisible(), false); await late.page.locator('#page-action').click(); assert.equal(await late.page.evaluate(() => pageClicks), 1); assert.deepEqual(late.errors, []); await late.ctx.close();
    console.log('PASS Passive filtered pins before opening issues, during placement/drafts, immediately after save before uploads, after repeated feedback/Escape, under status/search/empty filters, failed refresh, and delayed reads/writes. No client data changed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
