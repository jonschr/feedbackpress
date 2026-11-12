(() => {
  'use strict';
  const c = window.FeedbackPressAccess;
  if (!c) return;
  function invitation() {
    const hash = new URLSearchParams(location.hash.slice(1)), token = hash.get('fp-review');
    // A fragment never enters HTTP/referrer logs; remove it before loading the review UI.
    if (token) history.replaceState(history.state, '', location.pathname + location.search + (hash.get('fp-return') ? '#' + hash.get('fp-return') : ''));
    return token;
  }
  const initialToken = invitation();
  const endpoint = new URL(c.api);
  if (endpoint.searchParams.has('rest_route')) endpoint.searchParams.set('rest_route', endpoint.searchParams.get('rest_route').replace(/\/$/, '') + '/review-session');
  else endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/review-session';
  const script = src => new Promise((resolve, reject) => { const node = document.createElement('script'); node.src = src; node.onload = resolve; node.onerror = () => reject(new Error('FeedbackPress could not load. Reload this page to try again.')); document.head.append(node); });
  async function start(token) {
    try {
      if (!token && !c.nonce && !document.cookie.split('; ').some(value => value === 'feedbackpress_review_active=1')) return;
      const request = nonce => fetch(endpoint, { method: token ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(nonce ? { 'X-WP-Nonce': nonce } : {}) }, ...(token ? { body: JSON.stringify({ token }) } : {}) });
      let response = await request(c.nonce), data = await response.json();
      // A cached nonce from another WordPress login must never select the old private actor.
      if (!response.ok && c.nonce && data.code === 'rest_cookie_invalid_nonce') { response = await request(''); data = await response.json(); }
      if (!response.ok) { if (!token) return; throw new Error(data.message || 'Review access is unavailable. Ask the site administrator for a new link.'); }
      if (token && !document.cookie.split('; ').some(value => value === 'feedbackpress_review_active=1')) throw new Error('Allow site cookies, then open this review link again.');
      if (document.getElementById('feedbackpress-root')) return;
      window.FeedbackPressConfig = data.config;
      await script(data.capture); await script(data.script);
    } catch (error) {
      const host = document.createElement('div'); host.dataset.html2canvasIgnore = 'true'; const root = host.attachShadow({ mode: 'open' });
      const box = document.createElement('div'); box.setAttribute('role', 'alert');
      Object.assign(box.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', maxWidth: 'min(380px, calc(100vw - 32px))', padding: '16px', background: '#fff', color: '#20242b', boxShadow: '0 4px 24px #0003', font: '14px/1.5 system-ui' });
      box.append(document.createTextNode(error.message + ' ')); const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss'; close.style.cssText = 'font:inherit;color:#20242b;background:#f5f6f8;border:1px solid #838c99;border-radius:4px;padding:4px 8px;cursor:pointer'; close.onclick = () => host.remove(); box.append(close); root.append(box); document.body.append(host);
    }
  }
  let pending = Promise.resolve();
  const queue = token => { pending = pending.catch(() => {}).then(() => start(token)); };
  addEventListener('hashchange', () => { const token = invitation(); if (token) queue(token); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => queue(initialToken), { once: true }); else queue(initialToken);
})();
