(() => {
  'use strict';
  const c = window.FeedbackPressAdmin;
  if (!c) return;
  const request = async (path, body = {}) => {
    const response = await fetch(c.api + path, { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': c.nonce, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data;
    try { data = await response.json(); }
    catch (_) { throw new Error('The server returned an unreadable response (HTTP ' + response.status + '). Check connection diagnostics.'); }
    if (!response.ok) throw new Error(data?.message || 'Request failed (HTTP ' + response.status + ').');
    return data;
  };
  let rowNumber = 0;
  document.querySelector('.fp-add-peer').addEventListener('click', () => {
    const holder = document.createElement('template'); holder.innerHTML = document.getElementById('fp-peer-template').innerHTML.replaceAll('__KEY__', 'new-' + Date.now() + '-' + (++rowNumber));
    document.getElementById('fp-sites').append(holder.content);
    document.querySelector('#fp-sites .fp-site:last-child .fp-site-url').focus();
  });
  document.addEventListener('click', event => { if (event.target.matches('.fp-remove-peer')) event.target.closest('.fp-site').remove(); });
  document.addEventListener('change', event => { if (event.target.matches('.fp-site-type')) event.target.closest('.fp-site').querySelector('.fp-basic-auth').hidden = event.target.value === 'local'; });
  document.getElementById('fp-join-code').addEventListener('input', event => { document.querySelector('.fp-join-type').hidden = !event.target.value.trim(); });
  const copyNetwork = async (button, provision) => {
    const status = document.getElementById('fp-copy-status'), field = document.getElementById('fp-network-code');
    const label = provision ? 'Copy reconnect code' : 'Copy connection code';
    button.disabled = true; button.textContent = 'Copying…'; status.textContent = 'Preparing connection code…'; field.hidden = true; field.value = '';
    try {
      const code = request('network/code', provision ? { provision } : {}).then(data => {
        if (typeof data?.code !== 'string' || !data.code.startsWith('fp1:')) throw new Error('The server did not return a valid connection code.');
        return data.code;
      });
      let copied;
      if (navigator.clipboard?.write && window.ClipboardItem) {
        // Start the clipboard operation in the click gesture; Safari cannot start it after fetch resolves.
        const content = code.then(text => new Blob([text], { type: 'text/plain' }));
        content.catch(() => {});
        try { copied = navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]).then(() => true, () => false); }
        catch (_) { copied = Promise.resolve(false); }
      } else {
        copied = code.then(async text => {
          try { await navigator.clipboard.writeText(text); return true; } catch (_) { return false; }
        }, () => false);
      }
      field.value = await code;
      if (await copied) { button.textContent = 'Code copied'; status.textContent = 'Connection code copied. Paste it in FeedbackPress on your other WordPress installation. Codes expire after 24 hours.'; }
      else { button.textContent = label; field.hidden = false; field.focus(); field.select(); status.textContent = 'Automatic copying was blocked. The connection code is selected below; press Command+C or Ctrl+C to copy it.'; }
    } catch (error) { button.textContent = label; status.textContent = error.message; } finally { button.disabled = false; }
  };
  document.getElementById('fp-copy-network').addEventListener('click', event => copyNetwork(event.currentTarget));
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
  document.addEventListener('pointerdown', () => { lastUse = Date.now(); if (!timer) sync(); }, { passive: true });
  document.addEventListener('keydown', () => { lastUse = Date.now(); if (!timer) sync(); });
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); timer = null; if (!document.hidden) { lastUse = Date.now(); sync(); } });
  sync();
})();
