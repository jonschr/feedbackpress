(() => {
  'use strict';
  const c = window.FeedbackPressAccess;
  if (!c) return;
  const domReady = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
  let earlyStyle = null, shell = null;
  function finishBoot(ready = false) {
    shell?.remove(); shell = null;
    if (!ready && earlyStyle) { earlyStyle.remove(); document.documentElement.removeAttribute('data-feedbackpress-room'); }
    earlyStyle = null;
  }
  function prepareBoot() {
    // Only layout is restored before authorization; cached feedback and identity stay behind the access check.
    let view;
    try { view = JSON.parse(sessionStorage.getItem('feedbackpress-view:' + c.home) || '{}'); } catch (_) { return; }
    if (view?.open !== true) return;
    const side = view.sidebarSide === 'left' ? 'left' : 'right';
    const room = innerWidth >= 900 && view.pageLayout !== 'overlay';
    const width = document.documentElement.clientWidth || innerWidth;
    const scale = room ? (width - 400) / width : 1;
    const zoom = (parseFloat(getComputedStyle(document.documentElement).zoom) || 1) * scale;
    if (room) {
      earlyStyle = document.createElement('style'); earlyStyle.dataset.feedbackpressLayout = '';
      earlyStyle.textContent = `html[data-feedbackpress-room]{zoom:${zoom}!important;box-sizing:border-box!important;width:${width * scale / zoom}px!important;min-width:0!important;max-width:none!important;margin-left:${side === 'left' ? 400 / zoom : 0}px!important;margin-right:0!important}html[data-feedbackpress-room] #feedbackpress-root{zoom:${1 / zoom}!important}`;
      document.head.append(earlyStyle); document.documentElement.setAttribute('data-feedbackpress-room', side);
    }
    const appearance = (() => { try { return localStorage.getItem('feedbackpress-appearance'); } catch (_) {} })();
    const dark = appearance === 'dark' || appearance !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches;
    shell = document.createElement('div'); shell.id = 'feedbackpress-boot'; shell.setAttribute('aria-hidden', 'true'); shell.dataset.html2canvasIgnore = 'true';
    shell.style.cssText = `all:initial;position:fixed;top:0;${side}:0;width:min(400px,100vw);height:100dvh;background:${dark ? '#17191e' : '#fff'};z-index:2147483646;zoom:${room ? 1 / zoom : 1};pointer-events:none`;
    document.documentElement.append(shell);
  }
  function preload(href, as) {
    if (!href) return;
    const link = document.createElement('link'); link.rel = 'preload'; link.as = as; link.href = href; document.head.append(link);
  }
  addEventListener('resize', () => { if (shell) { finishBoot(); prepareBoot(); } });
  function invitation() {
    const hash = new URLSearchParams(location.hash.slice(1)), token = hash.get('fp-review');
    // A fragment never enters HTTP/referrer logs; remove it before loading the review UI.
    if (token) history.replaceState(history.state, '', location.pathname + location.search + (hash.get('fp-return') ? '#' + hash.get('fp-return') : ''));
    return {token, invitation: hash.get('fp-invite'), verification: hash.get('fp-verify')};
  }
  const initialToken = invitation();
  const endpoint = new URL(c.api);
  if (endpoint.searchParams.has('rest_route')) endpoint.searchParams.set('rest_route', endpoint.searchParams.get('rest_route').replace(/\/$/, '') + '/review-session');
  else endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/review-session';
  const script = src => new Promise((resolve, reject) => { const node = document.createElement('script'); node.src = src; node.onload = resolve; node.onerror = () => reject(new Error('FeedbackPress could not load. Reload this page to try again.')); document.head.append(node); });
  async function start({token, invitation, verification}) {
    try {
      if (!token && !c.nonce && !c.publicReview && !document.cookie.split('; ').some(value => value === 'feedbackpress_review_active=1')) return;
      if (!document.getElementById('feedbackpress-root')) { prepareBoot(); preload(c.script, 'script'); preload(c.css, 'style'); }
      const request = nonce => fetch(endpoint, { method: token ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(nonce ? { 'X-WP-Nonce': nonce } : {}) }, ...(token ? { body: JSON.stringify({ token, ...(invitation ? {invitation} : {}), ...(verification ? {verification} : {}) }) } : {}) });
      let response = await request(c.nonce), data = await response.json();
      // A cached nonce from another WordPress login must never select the old private actor.
      if (!response.ok && c.nonce && data.code === 'rest_cookie_invalid_nonce') { response = await request(''); data = await response.json(); }
      if (!response.ok) { if (!token) { finishBoot(); return; } throw new Error(data.message || 'Review access is unavailable. Ask the site administrator for a new link.'); }
      if (token && !data.config?.userName && !document.cookie.split('; ').some(value => value === 'feedbackpress_review_active=1')) throw new Error('Allow site cookies, then open this review link again.');
      if (document.getElementById('feedbackpress-root')) return;
      window.FeedbackPressConfig = { ...data.config, capture: data.capture, finishBoot };
      await domReady;
      await script(data.script);
    } catch (error) {
      finishBoot(); await domReady;
      const host = document.createElement('div'); host.dataset.html2canvasIgnore = 'true'; const root = host.attachShadow({ mode: 'open' });
      const box = document.createElement('div'); box.setAttribute('role', 'alert');
      Object.assign(box.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', maxWidth: 'min(380px, calc(100vw - 32px))', padding: '16px', background: '#fff', color: '#20242b', boxShadow: '0 4px 24px #0003', font: '14px/1.5 system-ui' });
      box.append(document.createTextNode(error.message + ' ')); const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss'; close.style.cssText = 'font:inherit;color:#20242b;background:#f5f6f8;border:1px solid #838c99;border-radius:4px;padding:4px 8px;cursor:pointer'; close.onclick = () => host.remove(); box.append(close); root.append(box); document.body.append(host);
    }
  }
  let pending = Promise.resolve();
  const queue = token => { pending = pending.catch(() => {}).then(() => start(token)); };
  addEventListener('hashchange', () => { const entry = invitation(); if (entry.token) queue(entry); });
  queue(initialToken);
})();
