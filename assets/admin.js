(() => {
  'use strict';
  const c = FeedbackPressAdmin, $ = id => document.getElementById(id);
  let state = null, projects = [], filtered = [], active = -1, projectDraftId = null, busy = false;
  const show = (text, error = false) => { const node = $('fp-admin-message'); node.hidden = false; node.className = 'notice inline ' + (error ? 'notice-error' : 'notice-success'); node.querySelector('p').textContent = text; };
  async function api(path, body) {
    const url = new URL(c.api); if (url.searchParams.has('rest_route')) url.searchParams.set('rest_route', url.searchParams.get('rest_route').replace(/\/$/, '') + '/admin/' + path); else url.pathname = url.pathname.replace(/\/$/, '') + '/admin/' + path;
    const response = await fetch(url, { credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST', headers: { 'X-WP-Nonce': c.nonce, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.message || 'The request failed. Try again.'); return data;
  }
  async function run(form, action) {
    if (busy) return; busy = true;
    const controls = [...document.querySelectorAll('.fp-settings button,.fp-settings input,.fp-settings select')].filter(node => !node.disabled);
    controls.forEach(node => node.disabled = true); form?.setAttribute('aria-busy', 'true');
    try { await action(); } catch (error) { show(error.message, true); } finally { controls.forEach(node => { if (node.isConnected) node.disabled = false; }); form?.removeAttribute('aria-busy'); busy = false; }
  }
  const search = $('fp-project-search'), options = $('fp-project-options');
  function closePicker() { if (!options) return; options.hidden = true; search.setAttribute('aria-expanded', 'false'); search.removeAttribute('aria-activedescendant'); search.value = state?.project?.name || ''; }
  function highlight(index) {
    active = filtered.length ? Math.max(0, Math.min(index, filtered.length - 1)) : -1;
    [...options.querySelectorAll('[role=option]')].forEach((node, i) => node.classList.toggle('is-active', i === active));
    if (active >= 0) { const node = options.querySelectorAll('[role=option]')[active]; search.setAttribute('aria-activedescendant', node.id); node.scrollIntoView({ block: 'nearest' }); }
    else search.removeAttribute('aria-activedescendant');
  }
  function openPicker(query = '') {
    if (busy || search.disabled) return;
    filtered = projects.filter(project => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    options.replaceChildren();
    for (const project of filtered) {
      const node = document.createElement('li'); node.id = 'fp-project-' + project.id; node.setAttribute('role', 'option'); node.setAttribute('aria-selected', String(project.id === state?.project?.id));
      const name = document.createElement('span'); name.textContent = project.name; const count = document.createElement('small'); const n = Number(project.site_count || 0); count.textContent = `${n} ${n === 1 ? 'site' : 'sites'}`; node.append(name, count);
      node.addEventListener('pointerdown', event => event.preventDefault()); node.addEventListener('click', () => choose(project.id)); options.append(node);
    }
    if (!filtered.length) { const empty = document.createElement('li'); empty.className = 'fp-no-projects'; empty.textContent = 'No projects match this search.'; options.append(empty); }
    options.hidden = false; search.setAttribute('aria-expanded', 'true'); highlight(0);
  }
  async function refresh(next) {
    const nextState = next || await api('connection'); const nextProjects = await api('projects');
    state = nextState; projects = nextProjects;
    search.disabled = false; $('fp-project-picker').setAttribute('aria-busy', 'false'); closePicker();
    $('fp-project-state').textContent = state.disconnected ? 'This site is disconnected. Choose a project to reconnect.' : state.project ? 'Switching projects moves this site’s connection, not its feedback.' : 'Choose a project to connect this site.';
    const section = $('fp-connected-sites'); section.replaceChildren(); const heading = document.createElement('h3'); heading.textContent = 'Sites in this project'; section.append(heading);
    if (!state.project) { const p = document.createElement('p'); p.className = 'description'; p.textContent = 'Choose a project above to see its sites.'; section.append(p); return; }
    const list = document.createElement('ul'); list.className = 'fp-site-list';
    for (const site of state.project.sites || []) {
      const row = document.createElement('li'), copy = document.createElement('div'), url = document.createElement('a'); url.href = site.url; url.target = '_blank'; url.rel = 'noopener'; url.textContent = site.url; copy.append(url);
      if (site.url === state.current_url) { const tag = document.createElement('small'); tag.textContent = 'This site'; copy.append(tag); }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button-link button-link-delete'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + site.url);
      remove.addEventListener('click', () => run(section, async () => { const next = await api('site/remove', { url: site.url }); await refresh(next); show('Site removed from this project. An administrator can reconnect it through project selection.'); }));
      row.append(copy, remove); list.append(row);
    }
    if (!list.children.length) { const p = document.createElement('p'); p.className = 'description'; p.textContent = 'No sites are connected to this project.'; section.append(p); } else section.append(list);
  }
  function choose(id) {
    closePicker(); if (id === state?.project?.id && !state?.disconnected) return;
    run($('fp-main') || $('fp-project-picker'), async () => { const next = await api('project', { project: id }); await refresh(next); show('Connected to ' + next.project.name + '.'); });
  }
  search?.addEventListener('focus', () => { search.select(); openPicker(); });
  search?.addEventListener('click', () => { if (options.hidden) openPicker(); });
  search?.addEventListener('input', () => openPicker(search.value));
  search?.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (options.hidden) openPicker(); else highlight(active + (event.key === 'ArrowDown' ? 1 : -1)); }
    else if (event.key === 'Enter' && !options.hidden) { event.preventDefault(); if (filtered[active]) choose(filtered[active].id); }
    else if (event.key === 'Escape' || event.key === 'Tab') closePicker();
  });
  document.addEventListener('pointerdown', event => { if (search && !event.target.closest('.fp-project-picker')) closePicker(); });
  $('fp-account')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => { await api('account', { service: $('fp-service').value, key: $('fp-account-key').value }); $('fp-account-key').value = ''; location.reload(); }); });
  $('fp-new-project')?.addEventListener('click', () => { closePicker(); projectDraftId = crypto.randomUUID(); $('fp-create-project').hidden = false; $('fp-project-name').focus(); });
  $('fp-cancel-project')?.addEventListener('click', () => { $('fp-create-project').hidden = true; $('fp-project-name').value = ''; });
  $('fp-create-project')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => { const next = await api('project/new', { id: projectDraftId, name: $('fp-project-name').value }); await refresh(next); $('fp-create-project').hidden = true; $('fp-project-name').value = ''; show('Created and connected to ' + next.project.name + '.'); }); });
  $('fp-access')?.addEventListener('submit', event => { event.preventDefault(); run(event.currentTarget, async () => { await api('settings', { mode: $('fp-mode').value }); show('Review access saved.'); }); });
  $('fp-disconnect')?.addEventListener('click', event => run(event.currentTarget.parentElement, async () => { const result = await api('disconnect', {}); const url = new URL(location.href); url.searchParams.set('disconnected', result.remote_removed ? '1' : 'unconfirmed'); location.assign(url); }));
  $('fp-diagnostics')?.addEventListener('toggle', async event => { if (!event.currentTarget.open) return; try { const log = await api('log'); $('fp-log').textContent = log.length ? log.map(row => `${row.utc}  ${row.operation}  ${row.status || 'connection failed'}  ${row.ms} ms`).join('\n') : 'No requests yet.'; } catch (error) { $('fp-log').textContent = error.message; } });
  if (search) refresh().catch(error => { $('fp-project-state').textContent = 'Could not load projects.'; show(error.message, true); });
})();
