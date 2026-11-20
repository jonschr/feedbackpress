// Real head bootstrap and UI; all access, cookie and asset responses are synthetic.
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const base = 'https://feedbackpress.test', token = 'synthetic-loading-link';
    const issue = { id: '11111111-1111-4111-8111-111111111111', number: 1, title: 'Authorized issue', body: 'Shared context', author: 'Reviewer', status: 'todo', path: '/', revision: 1, files: [], activity: [], target: { selector: '#target', x: .5, y: .5 } };
    for (const variant of ['desktop', 'mobile-dark-reduced', 'continuation', 'denied', 'network-failed', 'script-failed', 'css-failed', 'cookies-blocked', 'quiet-public', 'quiet-private']) {
      console.log('Checking', variant);
      const mobile = variant === 'mobile-dark-reduced', quiet = variant.startsWith('quiet-');
      const context = await browser.newContext({ viewport: { width: mobile ? 320 : 1280, height: 900 }, colorScheme: mobile ? 'dark' : 'light', reducedMotion: mobile ? 'reduce' : 'no-preference' });
      const errors = [], events = [], deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
      const access = deferred(), theme = deferred(), script = deferred(), css = deferred(), started = { access: deferred(), theme: deferred(), script: deferred(), css: deferred() };
      const config = { api: base + '/api/', home: base, css: base + '/review.css', nonce: 'fixture', userName: '', reviewSession: true, maxBytes: 5242880, privateNotes: false };
      const boot = { home: base, api: config.api, script: base + '/review.js', css: config.css, publicReview: variant === 'quiet-public' };
      let failAccess = variant === 'denied';
      if (variant === 'continuation') await context.addInitScript(home => { sessionStorage.setItem('feedbackpress-view:' + home, JSON.stringify({ open: true, sidebarSide: 'left', pageLayout: 'room' })); }, base);
      await context.route(base + '/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (path === '/access.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('assets/review-access.js', 'utf8') });
        if (path === '/theme.js') { started.theme.resolve(); await theme.promise; return route.fulfill({ contentType: 'text/javascript', body: '' }); }
        if (path === '/review.js' || path === '/review.css') {
          const kind = path.endsWith('.js') ? 'script' : 'css'; events.push(kind); started[kind].resolve(); await (kind === 'script' ? script : css).promise;
          if (variant === kind + '-failed') return route.abort();
          return route.fulfill({ contentType: kind === 'script' ? 'text/javascript' : 'text/css', body: fs.readFileSync('assets' + path, 'utf8') });
        }
        if (path.endsWith('.woff2')) return route.fulfill({ body: fs.readFileSync('assets/fonts/InterVariable.woff2') });
        if (path === '/api/review-session') {
          events.push('access'); started.access.resolve(); await access.promise;
          if (variant === 'network-failed') return route.abort();
          if (failAccess) return route.fulfill({ status: 403, json: { message: 'This review link is unavailable. Ask for a new link.' } });
          return route.fulfill({ headers: variant === 'cookies-blocked' ? {} : { 'Set-Cookie': 'feedbackpress_review_active=1; Path=/; Secure; SameSite=Lax' }, json: { config, script: boot.script } });
        }
        if (path.startsWith('/api/')) return route.fulfill({ json: path === '/api/issues' ? { issues: [issue], total: 1, page: 1 } : issue });
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.FeedbackPressAccess=${JSON.stringify(boot)};</script><script src="/access.js"></script><script src="/theme.js"></script></head><body><main><h1 id="target">Client website</h1></main></body></html>` });
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + (quiet ? '/' : '/?feedbackpress=open#fp-review=' + token), { waitUntil: 'commit' });
      await started.theme.promise;
      const loading = page.locator('#feedbackpress-loading'), status = loading.getByRole('status');
      if (quiet) {
        if (variant === 'quiet-public') { await started.access.promise; assert.equal(await loading.count(), 0); }
        theme.resolve(); access.resolve(); script.resolve(); css.resolve();
        await page.waitForLoadState('domcontentloaded');
        if (variant === 'quiet-public') await page.getByRole('button', { name: 'View issues', exact: true }).waitFor();
        else assert.equal(events.includes('access'), false);
        assert.equal(await loading.count(), 0); await context.close(); continue;
      }
      await Promise.all([started.access.promise, started.script.promise, started.css.promise]);
      await status.waitFor(); assert.equal(await status.innerText(), 'Opening FeedbackPress…');
      assert.equal(await page.evaluate(() => document.readyState), 'loading', 'Status paints before a blocking host script finishes');
      assert.equal(await page.locator('#feedbackpress-root').count(), 0);
      assert.equal(await page.evaluate(() => 'FeedbackPressConfig' in window), false, 'No reviewer configuration or issue UI before authorization');
      assert.ok(!page.url().includes(token)); assert.ok(events.includes('script') && events.includes('css'));
      assert.equal(await status.locator('.spinner').evaluate(node => getComputedStyle(node).animationName), mobile ? 'none' : 'fp-loading');
      assert.equal(await status.evaluate(node => getComputedStyle(node).backgroundColor), mobile ? 'rgb(23, 25, 30)' : 'rgb(255, 255, 255)');
      const rect = await loading.boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= (mobile ? 320 : 1280));
      if (variant === 'continuation') {
        assert.equal(await page.locator('#feedbackpress-boot').getAttribute('aria-hidden'), 'true');
        assert.equal(await status.evaluate(node => Boolean(node.closest('[aria-hidden="true"]'))), false);
        await page.setViewportSize({ width: 390, height: 844 }); await status.waitFor(); await page.setViewportSize({ width: 1280, height: 900 }); await status.waitFor();
      }
      access.resolve();
      if (['denied', 'network-failed', 'cookies-blocked'].includes(variant)) {
        theme.resolve(); script.resolve(); css.resolve(); await page.getByRole('alert').waitFor(); assert.equal(await loading.count(), 0); assert.equal(await page.locator('#feedbackpress-root').count(), 0); assert.equal(await page.locator('#feedbackpress-boot').count(), 0);
        if (variant === 'denied') {
          failAccess = false; await page.goto(base + '/?feedbackpress=open#fp-review=' + token); await page.getByRole('complementary', { name: 'Issues', exact: true }).waitFor(); await loading.waitFor({ state: 'detached' });
        }
      } else {
        await page.waitForFunction(() => Boolean(window.FeedbackPressConfig), null, { polling: 20 });
        assert.equal(await page.locator('#feedbackpress-root').count(), 0, 'Authorization does not skip host DOM readiness'); assert.equal(await loading.isVisible(), true);
        theme.resolve(); await page.waitForLoadState('domcontentloaded'); assert.equal(await loading.isVisible(), true);
        if (['desktop', 'mobile-dark-reduced'].includes(variant)) await page.screenshot({ path: '/tmp/feedbackpress-loading-' + variant + '.png', timeout: 30000 });
        script.resolve();
        if (variant === 'script-failed') {
          css.resolve(); await page.getByRole('alert').waitFor(); await loading.waitFor({ state: 'detached' }); assert.equal(await page.locator('#feedbackpress-root').count(), 0);
        } else {
          await page.locator('#feedbackpress-root').waitFor({ state: 'attached' });
          assert.equal(await page.locator('#feedbackpress-root').evaluate(node => node.style.visibility), 'hidden'); assert.equal(await loading.isVisible(), true, 'Keep status until actual UI CSS readiness');
          css.resolve(); await loading.waitFor({ state: 'detached' });
          if (variant === 'css-failed') { await page.locator('#feedbackpress-root').waitFor({ state: 'detached' }); assert.equal(await page.locator('html').getAttribute('data-feedbackpress-room'), null); }
          else { await page.getByRole('complementary', { name: 'Issues', exact: true }).waitFor(); assert.equal(await page.locator('#feedbackpress-boot').count(), 0); }
        }
      }
      assert.deepEqual(errors, []); await context.close();
    }
    console.log('PASS immediate logged-out review loading through held authorization/DOM/JS/CSS, preloads, dark/reduced-motion/mobile/continuation, failures/retry and silent ordinary visitors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
