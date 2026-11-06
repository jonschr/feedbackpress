(() => {
  'use strict';
  const c = window.FeedbackPressAdmin;
  if (!c) return;
  const request = async (path, body = {}) => {
    const response = await fetch(c.api + path, { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': c.nonce, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
  };
  document.querySelectorAll('.fp-add-peer').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.peerType, template = document.getElementById('fp-peer-' + type);
    const holder = document.createElement('template'); holder.innerHTML = template.innerHTML.replaceAll('__KEY__', 'new-' + crypto.randomUUID());
    document.querySelector(`[data-peer-type="${type}"].fp-peer-table tbody`).append(holder.content);
  }));
  document.addEventListener('click', event => { if (event.target.matches('.fp-remove-peer')) event.target.closest('tr').remove(); });
  const copyNetwork = async (button, provision) => {
    const status = document.getElementById('fp-copy-status'); button.disabled = true;
    try {
      const data = await request('network/code', provision ? { provision } : {}); const field = document.getElementById('fp-network-code'); field.value = data.code; field.hidden = false;
      try { await navigator.clipboard.writeText(data.code); if (provision) button.textContent = 'Copied'; status.textContent = 'Copied. Paste this private code on the installation joining the network.'; }
      catch (_) { field.focus(); field.select(); status.textContent = 'Select and copy the setup code below.'; }
    } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
  };
  document.getElementById('fp-copy-network').addEventListener('click', event => copyNetwork(event.target));
  document.querySelectorAll('.fp-provision-peer').forEach(button => button.addEventListener('click', () => copyNetwork(button, button.dataset.peer)));
  document.getElementById('fp-show-agent-key').addEventListener('click', event => { const field = document.getElementById('fp-agent-key'); field.type = field.type === 'password' ? 'text' : 'password'; event.target.textContent = field.type === 'password' ? 'Show key' : 'Hide key'; });
  let attempted = 0, lastUse = Date.now(), timer;
  const sync = async () => {
    clearTimeout(timer); timer = null;
    if (document.hidden || Date.now() - lastUse > 120000) return;
    const wait = 60000 - (Date.now() - attempted);
    if (wait > 0) { timer = setTimeout(sync, wait + 50); return; }
    attempted = Date.now(); const status = document.getElementById('fp-sync-status');
    try {
      const data = await request('sync/activity'); status.textContent = data.state === 'cooldown' ? 'Recently checked; next sync after the 60-second cooldown.' : data.state === 'disconnected' ? 'This installation is disconnected.' : data.state === 'busy' ? 'A sync is already running.' : 'Sync checked. See recent results below.';
      const log = await fetch(c.api + 'sync/log', { credentials: 'same-origin', headers: { 'X-WP-Nonce': c.nonce } });
      if (log.ok) document.getElementById('fp-sync-log').textContent = JSON.stringify(await log.json(), null, 2);
    } catch (error) { status.textContent = error.message; }
    timer = setTimeout(sync, 60050);
  };
  document.getElementById('fp-sync-now').addEventListener('click', () => { lastUse = Date.now(); sync(); });
  document.addEventListener('pointerdown', () => { lastUse = Date.now(); if (!timer) sync(); }, { passive: true });
  document.addEventListener('keydown', () => { lastUse = Date.now(); if (!timer) sync(); });
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); timer = null; if (!document.hidden) { lastUse = Date.now(); sync(); } });
  sync();
})();
