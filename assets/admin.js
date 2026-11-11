(() => {
  'use strict';
  const c = FeedbackPressAdmin, $ = id => document.getElementById(id);
  const show = (text, error = false) => { const node = $('fp-admin-message'); node.hidden = false; node.className = 'notice inline ' + (error ? 'notice-error' : 'notice-success'); node.querySelector('p').textContent = text; };
  async function api(path, body) {
    const response = await fetch(c.api + 'admin/' + path, { credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST', headers: { 'X-WP-Nonce': c.nonce, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.message || 'The request failed. Try again.'); return data;
  }
  async function run(form, action) {
    const controls = [...form.querySelectorAll('button')]; controls.forEach(b => b.disabled = true);
    try { await action(); } catch (error) { show(error.message, true); } finally { controls.forEach(b => b.disabled = false); }
  }
  $('fp-connect')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => { await api('connect', { code: $('fp-code').value.trim() }); location.reload(); }); });
  $('fp-copy')?.addEventListener('click', event => run(event.currentTarget.parentElement, async () => {
    const { code } = await api('code', {});
    if (!code.startsWith('fp2:')) throw new Error('The project connection code is unavailable. Reconnect this installation.');
    try { await navigator.clipboard.writeText(code); show('Project connection code copied.'); }
    catch { const field = $('fp-copy-fallback'); field.hidden = false; field.value = code; field.focus(); field.select(); show('Copy the selected connection code.'); }
  }));
  $('fp-account')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => {
    const data = await api('projects', { service: $('fp-service').value, account_key: $('fp-account-key').value });
    const select = $('fp-project-id'); select.replaceChildren(new Option('Create a new project', ''));
    for (const project of data.projects) select.add(new Option(project.name, project.id));
    $('fp-project').hidden = false; show('Choose a project or create a new one.');
  }); });
  $('fp-project-id')?.addEventListener('change', () => { const create = !$('fp-project-id').value; $('fp-project-name').hidden = !create; document.querySelector('label[for="fp-project-name"]').hidden = !create; });
  $('fp-project')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => {
    await api('project', { service: $('fp-service').value, account_key: $('fp-account-key').value, project: $('fp-project-id').value, name: $('fp-project-id').value ? '' : $('fp-project-name').value });
    $('fp-account-key').value = ''; location.reload();
  }); });
  $('fp-access')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => { await api('settings', { mode: $('fp-mode').value }); show('Review access saved.'); }); });
  $('fp-disconnect')?.addEventListener('click', event => run(event.currentTarget.parentElement, async () => { await api('disconnect', {}); location.reload(); }));
  $('fp-diagnostics')?.addEventListener('toggle', async event => { if (!event.currentTarget.open) return; try { const log = await api('log'); $('fp-log').textContent = log.length ? log.map(row => `${row.utc}  ${row.operation}  ${row.status || 'connection failed'}  ${row.ms} ms`).join('\n') : 'No requests yet. Visit the front end to start a connection check.'; } catch (error) { $('fp-log').textContent = error.message; } });
  if ($('fp-connected-sites')) api('connection').then(data => {
    const section = $('fp-connected-sites'); const heading = document.createElement('h3'); heading.textContent = 'Connected sites'; section.append(heading);
    const list = document.createElement('ul');
    for (const site of data.sites || []) { const row = document.createElement('li'); row.textContent = site.url; list.append(row); }
    section.append(list);
  }).catch(error => show(error.message, true));
})();
