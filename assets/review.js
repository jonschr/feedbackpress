(() => {
  'use strict';
  const c = window.FeedbackPressConfig;
  if (!c || document.getElementById('feedbackpress-root')) return;
  const host = document.createElement('div'); host.id = 'feedbackpress-root';
  host.setAttribute('data-html2canvas-ignore', 'true'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  let stylesReady = false;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = c.css; root.append(css);
  css.addEventListener('load', () => { stylesReady = true; if (open) render(); positionDraft(); });
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    if (tag === 'button' && attrs.type === 'submit') attrs = { ...attrs, 'data-fp-submit': true };
    if (busy && ['button', 'input', 'textarea', 'select'].includes(tag) && !attrs.disabled) attrs = { ...attrs, disabled: true, 'data-fp-busy-disabled': true };
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') node.className = v;
      else if (k === 'title' && ['button', 'a', 'time'].includes(tag)) node.dataset.tooltip = v;
      else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    }
    node.append(...children.filter(x => x != null)); return node;
  };
  const button = (text, fn, attrs = {}) => el('button', { type: 'button', onclick: fn, ...(attrs.class?.includes('fp-icon-button') && attrs['aria-label'] ? { title: attrs['aria-label'] } : {}), ...attrs }, text);
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', kind === 'close' ? 'M6 6l12 12M18 6L6 18' : kind === 'plus' ? 'M12 5v14M5 12h14' : kind === 'search' ? 'M21 21l-5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0' : kind === 'check' ? 'M5 12l4 4L19 6' : kind === 'todo' ? 'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h6' : kind === 'doing' ? 'M8 5l11 7-11 7z' : kind === 'document' ? 'M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h6' : kind === 'image' ? 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01' : kind === 'review' ? 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 11-6 0 3 3 0 016 0' : kind === 'previous' ? 'M15 6l-6 6 6 6' : kind === 'next' ? 'M9 6l6 6-6 6' : kind === 'chevron' ? 'M6 9l6 6 6-6' : 'M21 11.5l-8.5 8.5a6 6 0 01-8.5-8.5l9-9a4 4 0 015.7 5.7l-9 9a2 2 0 01-2.8-2.8l8.5-8.5');
    svg.append(path); return svg;
  }
  const labels = { todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' };
  const statusKeys = { todo: '1', doing: '2', review: '3', done: '4' };
  const submitShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ Enter' : 'Ctrl Enter';
  let name = c.userName || '', email = '', actorId = c.authorId || '', actorRequest = null;
  try { email = decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('feedbackpress_email='))?.slice('feedbackpress_email='.length) || ''); } catch (_) {}
  if (!name) {
    try {
      const saved = document.cookie.split('; ').find(value => value.startsWith('feedbackpress_name='));
      name = saved ? decodeURIComponent(saved.slice('feedbackpress_name='.length)) : localStorage.getItem('feedbackpress-name') || '';
    } catch (_) { /* Identity can still be entered when browser storage is disabled. */ }
  }
  let issues = [], pageIssues = [], selected = null, sort = 'number', search = '', searchTimer, filter = ['todo', 'review'], filterOpen = false, open = false, picking = false, busy = false, draft = null, screenshot = null, requestNumber = 0, issueRequest = 0, openingIssue = 0, uiSession = 0, listPage = 1, total = 0;
  const viewKey = 'feedbackpress-view:' + c.home;
  let keepListOrder = false, localWriteVersion = 0, pinDrag = null, suppressedPin = null, listLoaded = false, listLoading = true, listError = '', listScroll = 0, hasListPosition = false, resumeOpen = false;
  const editDrafts = new Map();
  const replyDrafts = new Map();
  const replyFiles = new Map();
  const pendingReplyIds = new Map();
  const replyOperations = new Map();
  let draftOperation = null;
  const privateNotes = new Map();
  const privateReply = new Set();
  const attachmentCache = new Map();
  let previewIssueId = null, viewerRequest = 0, returnFocus = null;
  try {
    const view = JSON.parse(sessionStorage.getItem(viewKey) || '{}');
    if (['page', 'number', 'completed', 'updated'].includes(view.sort)) sort = view.sort;
    if (typeof view.search === 'string') search = view.search;
    if (Array.isArray(view.filter)) filter = Object.keys(labels).filter(status => view.filter.includes(status));
    else if (view.filter === 'all') filter = Object.keys(labels);
    else if (Object.hasOwn(labels, view.filter)) filter = [view.filter];
    listPage = Math.max(1, Number(view.page) || 1);
    hasListPosition = Number.isFinite(view.scrollTop) && view.scrollTop >= 0;
    listScroll = hasListPosition ? view.scrollTop : 0;
    resumeOpen = view.open === true;
  } catch (_) { /* Storage is optional. */ }
  function saveView() { try { sessionStorage.setItem(viewKey, JSON.stringify({ sort, search, filter, page: listPage, scrollTop: hasListPosition ? listScroll : undefined, open: open || Boolean(openingIssue) })); } catch (_) {} }
  const homePath = new URL(c.home).pathname.replace(/\/$/, '');
  const pagePath = location.pathname.slice(homePath.length) || '/';
  const panel = el('aside', { class: 'panel', 'aria-label': 'Issues', hidden: true });
  const composer = el('section', { class: 'composer', 'aria-label': 'New feedback', hidden: true });
  const issuePopup = el('section', { class: 'composer issue-popup', 'aria-label': 'Issue details', hidden: true });
  const lightbox = el('dialog', { class: 'attachment-lightbox', 'aria-label': 'Attachment preview' });
  const identity = el('section', { class: 'identity', 'aria-label': 'Introduce yourself', hidden: true });
  const draftPin = el('span', { class: 'pin draft-pin', 'aria-label': 'New feedback pin', hidden: true });
  const tether = el('div', { class: 'tether', hidden: true, 'aria-hidden': 'true' });
  const pins = el('div', { class: 'pins' });
  const highlight = el('div', { class: 'highlight', hidden: true });
  const notice = el('div', { class: 'notice', role: 'status', 'aria-live': 'polite', hidden: true });
  const launcher = button('Leave feedback', () => withIdentity(startPick), { class: 'fp-primary', title: 'Leave feedback', 'data-tooltip-shortcut': 'C', 'aria-keyshortcuts': 'C' });
  const viewButton = button('View issues', () => withIdentity(() => { if (selected && innerWidth < 900 && panel.hidden) { open = true; viewButton.setAttribute('aria-expanded', 'true'); issuePopup.hidden = true; tether.hidden = true; panel.hidden = false; render(); } else toggle(!open); }), { 'aria-expanded': 'false', title: 'Toggle issues panel', 'data-tooltip-shortcut': 'V', 'aria-keyshortcuts': 'V' });
  const launchers = el('div', { class: 'launcher' }, viewButton, launcher);
  const toolbar = el('div', { class: 'feedback-toolbar' }, notice, launchers);
  function updateChrome() {
    launchers.hidden = open;
    toolbar.style.insetInlineEnd = open && innerWidth >= 900 ? panel.offsetWidth + 20 + 'px' : '';
    saveView();
  }
  function captureListScroll() {
    const list = panel.querySelector('.issue-list');
    if (stylesReady && !panel.hidden && !listLoading && list?.querySelector('.issue-row')) { listScroll = list.scrollTop; hasListPosition = true; }
  }
  function resetListScroll() {
    listScroll = 0; hasListPosition = true;
    const list = panel.querySelector('.issue-list'); if (list) list.scrollTop = 0;
  }
  root.append(pins, highlight, toolbar, panel, tether, draftPin, composer, issuePopup, lightbox, identity);
  root.addEventListener('scroll', event => { if (event.target.matches?.('.issue-list') && !panel.hidden && !listLoading) { captureListScroll(); saveView(); } }, { capture: true, passive: true });
  const tooltip = el('div', { id: 'fp-tooltip', class: 'fp-tooltip', role: 'tooltip', popover: 'manual', hidden: true });
  root.append(tooltip);
  let tooltipTarget = null, tooltipHideTimer;
  function hideTooltip() {
    clearTimeout(tooltipHideTimer);
    if (tooltipTarget) {
      const descriptions = (tooltipTarget.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tooltip.id);
      if (descriptions.length) tooltipTarget.setAttribute('aria-describedby', descriptions.join(' '));
      else tooltipTarget.removeAttribute('aria-describedby');
    }
    tooltipTarget = null;
    if (tooltip.hidePopover && tooltip.matches(':popover-open')) tooltip.hidePopover();
    tooltip.hidden = true;
  }
  function showTooltip(target) {
    clearTimeout(tooltipHideTimer);
    if (!target?.dataset.tooltip || target.disabled) return;
    hideTooltip(); tooltipTarget = target;
    (target.closest('dialog') || root).append(tooltip);
    const row = el('div', { class: 'tooltip-line' }, el('span', {}, target.dataset.tooltip));
    if (target.dataset.tooltipShortcut) row.append(el('kbd', {}, target.dataset.tooltipShortcut));
    tooltip.replaceChildren(row);
    if (target.dataset.tooltipNote) tooltip.append(el('small', {}, target.dataset.tooltipNote));
    target.setAttribute('aria-describedby', [target.getAttribute('aria-describedby'), tooltip.id].filter(Boolean).join(' '));
    tooltip.hidden = false;
    // The top layer avoids clipping inside scrolling panels and attachment dialogs.
    tooltip.showPopover?.();
    const rect = target.getBoundingClientRect(), width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 8, top = (viewport?.offsetTop || 0) + 8;
    const right = left + (viewport?.width || innerWidth) - 16, bottom = top + (viewport?.height || innerHeight) - 16;
    const above = rect.top - height - 9 >= top;
    const x = Math.max(left, Math.min(rect.left + rect.width / 2 - width / 2, right - width));
    const y = Math.max(top, Math.min(above ? rect.top - height - 9 : rect.bottom + 9, bottom - height));
    tooltip.dataset.side = above ? 'above' : 'below';
    Object.assign(tooltip.style, { left: x + 'px', top: y + 'px' });
    tooltip.style.setProperty('--tooltip-arrow', Math.max(12, Math.min(width - 12, rect.left + rect.width / 2 - x)) + 'px');
  }
  root.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (tooltip.contains(event.target)) { clearTimeout(tooltipHideTimer); return; }
    const target = event.target.closest?.('[data-tooltip]');
    if (target && !target.contains(event.relatedTarget)) showTooltip(target);
  });
  root.addEventListener('pointerout', event => {
    if (!tooltipTarget || tooltipTarget.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)) return;
    tooltipHideTimer = setTimeout(hideTooltip, 100);
  });
  root.addEventListener('focusin', event => { const target = event.target.closest?.('[data-tooltip]'); if (target) showTooltip(target); else hideTooltip(); });
  root.addEventListener('focusout', hideTooltip);
  root.addEventListener('click', hideTooltip, true);
  root.addEventListener('scroll', hideTooltip, true);
  addEventListener('scroll', hideTooltip, { passive: true });
  addEventListener('resize', hideTooltip);
  window.visualViewport?.addEventListener('resize', hideTooltip);
  window.visualViewport?.addEventListener('scroll', hideTooltip);
  new MutationObserver(() => { if (tooltipTarget && (!tooltipTarget.isConnected || tooltipTarget.disabled || tooltipTarget.closest('[hidden]'))) hideTooltip(); }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  const pendingRequests = new Map(), fileIds = new WeakMap();
  async function api(path, options = {}) {
    const headers = { 'X-WP-Nonce': c.nonce, ...(c.network ? { 'X-FeedbackPress-Network': c.network } : {}), ...options.headers };
    const writes = options.method && options.method !== 'GET';
    let signature;
    if (writes) {
      const body = options.body;
      const identity = body instanceof FormData ? [...body.entries()].map(([key, value]) => {
        if (value instanceof File) { if (!fileIds.has(value)) fileIds.set(value, crypto.randomUUID()); return [key, fileIds.get(value)]; }
        return [key, value];
      }) : body;
      signature = path + '\n' + JSON.stringify(identity);
      if (!pendingRequests.has(signature)) pendingRequests.set(signature, crypto.randomUUID());
      headers['Idempotency-Key'] = options.requestId || pendingRequests.get(signature);
    }
    if (options.body && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
    const [route, query] = path.split('?');
    const requestUrl = new URL(c.api + route);
    for (const [key, value] of new URLSearchParams(query || '')) requestUrl.searchParams.set(key, value);
    const response = await fetch(requestUrl, { credentials: 'same-origin', ...options, headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (signature && response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) pendingRequests.delete(signature);
      const error = new Error(data.message || `Request failed (${response.status}). Try again.`); error.status = response.status; throw error;
    }
    if (!writes) return response;
    // Keep the key until the complete JSON acknowledgment arrives, including uploads.
    const data = await response.json(); pendingRequests.delete(signature);
    if (path !== 'identity' && !path.startsWith('sync/')) { localWriteVersion++; activity(); }
    return { json: async () => data };
  }
  function message(text) { notice.replaceChildren(el('span', {}, text), button('Dismiss', () => { notice.hidden = true; positionDraft(); }, { class: 'notice-close' })); notice.hidden = false; positionDraft(); }
  function remember(value, address = email) {
    if (!c.userName && address.trim() !== email) { actorId = ''; actorRequest = null; }
    email = address.trim();
    name = value.trim();
    if (!c.userName && email) document.cookie = 'feedbackpress_email=' + encodeURIComponent(email) + '; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    if (!c.userName) document.cookie = 'feedbackpress_name=' + encodeURIComponent(name) + '; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  }
  function ensureActor() {
    if (actorId || c.userName) return Promise.resolve(actorId);
    if (!actorRequest) actorRequest = api('identity', { method: 'POST', body: { author: name, author_email: email } }).then(response => response.json()).then(person => { actorId = person.author_id; return actorId; }).catch(error => { actorRequest = null; throw error; });
    return actorRequest;
  }
  function withIdentity(action) {
    if (busy) return;
    if (name && (c.userName || email)) {
      if (!c.userName && !actorId) ensureActor().then(() => { if (selected && !busy && !root.activeElement?.matches('input,textarea,select')) renderIssue(); else if (selected) deferredIssueRender = true; }).catch(() => {});
      return action();
    }
    identity.replaceChildren(el('header', {}, el('h2', {}, 'Introduce yourself'), button(icon('close'), () => { identity.hidden = true; launcher.focus(); }, { class: 'fp-icon-button', 'aria-label': 'Dismiss name prompt' })));
    const input = el('input', { name: 'author', 'aria-label': 'Your name', required: true, maxlength: 120, autocomplete: 'name', placeholder: 'Your name' });
    input.value = name;
    const mail = el('input', { name: 'email', type: 'email', required: true, maxlength: 254, autocomplete: 'email', placeholder: 'Email address', 'aria-label': 'Email address' }); mail.value = email;
    identity.append(el('p', { class: 'subtle' }, 'So everyone knows who left the feedback. We’ll remember you on this site.'), el('form', { onsubmit: event => { event.preventDefault(); if (!input.value.trim()) return; remember(input.value, mail.value); identity.hidden = true; withIdentity(action); } }, input, mail, el('button', { type: 'submit', class: 'fp-primary' }, 'Continue')));
    panel.hidden = true; identity.hidden = false; input.focus();
  }
  function toggle(value) {
    if (busy) return;
    captureListScroll();
    issueRequest++; openingIssue = 0; if (!value) closeStatusFilter(); closeDraft(); cancelPick(); identity.hidden = true; notice.hidden = true; open = value;
    panel.hidden = !value; viewButton.setAttribute('aria-expanded', String(value));
    updateChrome(); positionDraft();
    if (value) { render(); load(null, true); } else viewButton.focus();
  }
  async function loadPagePins(statusFilter) {
    const result = [];
    const params = new URLSearchParams({ path: pagePath, order: 'number' });
    if (search.trim()) params.set('search', search.trim());
    params.set('status', statusFilter.join(',') || 'none');
    for (let page = 1; ; page++) {
      params.set('page', String(page));
      const data = await (await api('issues?' + params)).json();
      result.push(...data.issues);
      if (result.length >= data.total || !data.issues.length) return result;
    }
  }
  async function load(focus = null, preserveOrder = false) {
    clearTimeout(searchTimer);
    const ticket = ++requestNumber;
    const params = new URLSearchParams({ page: String(listPage), order: sort });
    if (search.trim()) params.set('search', search.trim());
    if (typeof focus === 'string') params.set('focus', focus);
    params.set('status', filter.join(',') || 'none');
    try {
      // A sync response cannot stand in for the first filtered, paginated list read.
      const retained = preserveOrder && keepListOrder && listLoaded;
      listLoading = !retained; listError = '';
      if (open && !draft && !issues.length) render();
      const pinRead = loadPagePins(filter).then(currentPins => {
        if (ticket !== requestNumber) return;
        pageIssues = currentPins; drawPins(); positionDraft();
      });
      const [data] = await Promise.all([retained ? null : (async () => (await api('issues?' + params)).json())(), pinRead]); if (ticket !== requestNumber) return;
      listLoading = false;
      if (data) { issues = data.issues; total = data.total; listPage = data.page; listLoaded = true; keepListOrder = false; }
      saveView();
      if (open && !draft) render(); updateNavigation(); drawPins(); positionDraft();
    } catch (error) { if (ticket === requestNumber) { listLoading = false; listError = error.message; if (open) render(); if (!open || issues.length) message(error.message); } }
  }
  function statusControl(issue, place, change = null) {
    const actions = Object.entries(labels).map(([status, label]) => {
      const current = status === issue.status;
      const action = button(icon(status === 'done' ? 'check' : status), () => { if (!current || issue.conflict) { if (change) change(status); else setStatus(issue, status, action); } }, {
        class: 'fp-icon-button status-action status-' + status + (current ? ' is-current' : ''),
        'aria-pressed': String(current),
        'data-status-action': status,
        'aria-label': change ? `New issue status: ${label}` : `Set issue ${issue.number} to ${label}`,
        'aria-keyshortcuts': !change && selected?.id === issue.id ? statusKeys[status] : null,
        title: current && !issue.conflict ? label + ' — current' : 'Set to ' + label,
        'data-tooltip-shortcut': change ? null : statusKeys[status],
        'data-tooltip-note': change || selected?.id === issue.id ? null : 'Shortcut applies to the selected issue'
      });
      return action;
    });
    return el('div', { class: 'status-controls ' + place, 'data-status': issue.status },
      el('div', { class: 'status-actions', role: 'group', 'aria-label': change ? 'New issue status' : `Change status for issue ${issue.number}` }, ...actions));
  }
  function filterSummary() {
    return filter.length === 4 ? 'All statuses' : filter.length === 0 ? 'No statuses' : filter.length > 2 ? `${filter.length} statuses` : filter.map(status => labels[status]).join(' + ');
  }
  function closeStatusFilter(restoreFocus = false) {
    filterOpen = false;
    const trigger = panel.querySelector('.status-filter-trigger');
    const options = panel.querySelector('.status-filter-options');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (options) options.hidden = true;
    if (restoreFocus) trigger?.focus();
  }
  function statusFilterControl() {
    const options = el('fieldset', { id: 'fp-status-options', class: 'status-filter-options', hidden: !filterOpen }, el('legend', { class: 'visually-hidden' }, 'Visible statuses'));
    for (const [status, label] of Object.entries(labels)) {
      const input = el('input', { type: 'checkbox', checked: filter.includes(status), 'data-filter-status': status, onchange: event => {
        filter = Object.keys(labels).filter(value => value === status ? event.target.checked : filter.includes(value));
        listPage = 1; resetListScroll(); saveView();
        const summary = filterSummary();
        panel.querySelector('.filter-summary').textContent = summary;
        panel.querySelector('.status-filter-trigger').dataset.tooltip = summary;
        load();
      } });
      options.append(el('label', { class: 'filter-option', 'data-status': status }, input, el('span', { class: 'status-dot', 'aria-hidden': 'true' }), label));
    }
    const trigger = button(el('span', { class: 'filter-summary' }, filterSummary()), () => {
      filterOpen = !filterOpen; options.hidden = !filterOpen; trigger.setAttribute('aria-expanded', String(filterOpen));
      if (filterOpen) options.querySelector('input')?.focus();
    }, { class: 'status-filter-trigger', 'aria-label': 'Filter statuses', 'aria-expanded': String(filterOpen), 'aria-controls': 'fp-status-options', title: filterSummary() });
    trigger.append(icon('chevron'));
    return el('div', { class: 'status-filter' }, trigger, options);
  }
  document.addEventListener('pointerdown', event => {
    if (filterOpen && !event.composedPath().includes(panel.querySelector('.status-filter'))) closeStatusFilter();
  }, true);
  function render() {
    updateChrome();
    const searchInput = panel.querySelector('.issue-search');
    const searchSelection = root.activeElement === searchInput && searchInput ? [searchInput.selectionStart, searchInput.selectionEnd, searchInput.selectionDirection] : null;
    const focusedStatus = root.activeElement?.dataset.filterStatus;
    const focusedTrigger = root.activeElement?.classList.contains('status-filter-trigger');
    const heading = el('header', { class: 'panel-header' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Issues'), el('span', { class: 'issue-count', 'aria-live': 'polite' }, listLoading && !total ? 'Loading…' : `${total} ${total === 1 ? 'issue' : 'issues'}`)),
      el('div', { class: 'panel-actions' }, button(icon('plus'), () => withIdentity(startPick), { class: 'fp-icon-button', 'aria-label': 'Leave feedback', title: 'Leave feedback', 'data-tooltip-shortcut': 'C', 'aria-keyshortcuts': 'C' }), button(icon('close'), () => toggle(false), { class: 'fp-icon-button', 'aria-label': 'Dismiss issues', 'data-tooltip-shortcut': 'V', 'aria-keyshortcuts': 'V' })));
    const searchField = el('input', { type: 'search', class: 'issue-search', 'aria-label': 'Search issues and replies', placeholder: 'Search issues and replies…', value: search, oninput: event => {
      search = event.target.value; listPage = 1; resetListScroll(); saveView(); requestNumber++;
      clearTimeout(searchTimer); searchTimer = setTimeout(() => load(), 200);
    } });
    const order = el('select', { 'aria-label': 'Order issues', onchange: event => { sort = event.target.value; listPage = 1; resetListScroll(); saveView(); load(); } }, el('option', { value: 'number' }, 'By issue number'), el('option', { value: 'page' }, 'By page'), el('option', { value: 'completed' }, 'Completed: newest'), el('option', { value: 'updated' }, 'Last edited: newest')); order.value = sort;
    const list = el('div', { class: 'issue-list', 'aria-busy': String(listLoading || Boolean(openingIssue) || !stylesReady) });
    panel.replaceChildren(el('div', { class: 'panel-tools' }, heading, el('div', { class: 'search-field' }, icon('search'), searchField), el('div', { class: 'filters' }, order, statusFilterControl())), list);
    if (!issues.length) {
      if (listLoading) list.append(el('div', { class: 'list-placeholder', role: 'status', 'aria-label': 'Loading issues' }, ...Array.from({ length: 3 }, () => el('div', {}, el('span'), el('span'), el('span')))));
      else if (listError) list.append(el('div', { class: 'empty', role: 'status' }, el('p', { class: 'subtle' }, listError), button('Try again', () => load(), { class: 'fp-quiet' })));
      else list.append(el('p', { class: 'empty subtle' }, search.trim() ? 'No issues match this search and status filter.' : 'No issues match this filter.'));
    }
    let path = null;
    for (const issue of issues) {
      if (sort === 'page' && path !== issue.path) { path = issue.path; list.append(el('h3', { class: 'page-heading' }, pageLabel(path))); }
      list.append(issueRow(issue));
    }
    if (selected && !listLoading && !issues.some(issue => issue.id === selected.id)) list.append(el('small', { class: 'outside-filter' }, 'Selected issue outside this list'), issueRow(selected));
    if (total > 50) panel.append(el('nav', { class: 'actions pagination', 'aria-label': 'Issue pages' }, button(icon('previous'), () => { listPage--; resetListScroll(); load(); }, { class: 'fp-icon-button', 'aria-label': 'Previous list page', disabled: listPage <= 1 }), el('small', {}, `${listPage} / ${Math.ceil(total / 50)}`), button(icon('next'), () => { listPage++; resetListScroll(); load(); }, { class: 'fp-icon-button', 'aria-label': 'Next list page', disabled: listPage * 50 >= total })));
    // Hidden/mobile and loading lists have no usable scroll range; retain the saved position until visible.
    if (stylesReady && !panel.hidden && issues.length) {
      list.scrollTop = listScroll;
      if (!listLoading) { listScroll = list.scrollTop; hasListPosition = true; saveView(); }
    }
    if (filterOpen && focusedStatus) panel.querySelector(`[data-filter-status="${focusedStatus}"]`)?.focus();
    else if (focusedTrigger) panel.querySelector('.status-filter-trigger')?.focus();
    else if (searchSelection) { searchField.focus({ preventScroll: true }); searchField.setSelectionRange(...searchSelection); }
  }
  function pageLabel(path) { return path === '/' ? c.home.replace(/\/$/, '') + '/' : path; }
  function issueRow(issue) {
    const active = selected?.id === issue.id;
    return el('div', { class: 'issue-row' + (active ? ' is-selected' : ''), 'data-issue': issue.id, 'data-status': issue.status },
      el('button', { type: 'button', class: 'issue-open', 'aria-current': active ? 'true' : null, onclick: () => showIssue(issue.id) }, el('span', { class: 'row-heading' }, el('span', { class: 'row-number' }, '#' + issue.number), el('span', { class: 'row-author' }, issue.author)), el('span', { class: 'issue-body' }, issue.title || issue.body), sort !== 'page' ? el('small', { class: 'page-reference' }, pageLabel(issue.path)) : null), statusControl(issue, 'row-status'));
  }
  function navigationIssues() {
    if (!selected || issues.some(issue => issue.id === selected.id)) return issues;
    return [...issues, selected].sort((a, b) => (['completed', 'updated'].includes(sort) ? (b[sort + '_at'] || '').localeCompare(a[sort + '_at'] || '') : 0) || (sort === 'page' ? a.path.localeCompare(b.path, 'en', { numeric: true }) : 0) || String(a.number).localeCompare(String(b.number), 'en', { numeric: true }) || a.id.localeCompare(b.id));
  }
  function updateNavigation() {
    if (!selected || issuePopup.hidden) return;
    const items = navigationIssues();
    const index = items.findIndex(issue => issue.id === selected.id);
    const previous = issuePopup.querySelector('[aria-label="Previous issue"]');
    const next = issuePopup.querySelector('[aria-label="Next issue"]');
    for (const [control, disabled] of [[previous, index <= 0 && listPage <= 1], [next, index >= items.length - 1 && listPage * 50 >= total]]) {
      if (!control) continue;
      control.disabled = disabled || busy;
      if (disabled) control.removeAttribute('data-fp-busy-disabled');
      else if (busy) control.setAttribute('data-fp-busy-disabled', '');
    }
  }
  function closeIssue() { clearAttachments(); selected = null; issuePopup.hidden = true; tether.hidden = true; if (open) panel.hidden = false; render(); drawPins(); }
  async function stepIssue(direction) {
    if (busy) return;
    const items = navigationIssues();
    const index = items.findIndex(issue => issue.id === selected?.id);
    const next = index + direction;
    if (next < 0 && listPage > 1) { listPage--; await load(); if (issues.length) await showIssue(issues.at(-1).id); }
    else if (next >= items.length && listPage * 50 < total) { listPage++; await load(); if (issues.length) await showIssue(issues[0].id); }
    else if (items[next]) await showIssue(items[next].id);
  }
  async function showIssue(id, scroll = true) {
    if (scroll) closeStatusFilter();
    captureListScroll(); const keepPosition = hasListPosition;
    const ticket = ++issueRequest; openingIssue = ticket;
    panel.querySelector('.issue-list')?.setAttribute('aria-busy', 'true');
    try {
      const issue = await (await api('issues/' + id)).json();
      if (ticket !== issueRequest) return;
      if (issue.path !== pagePath) { captureListScroll(); saveView(); location.assign(c.home + issue.path + '#feedbackpress=' + issue.id); return; }
      closeDraft(); cancelPick(); selected = issue; issues = issues.map(existing => existing.id === issue.id ? issue : existing); if (scroll) open = true; panel.hidden = !open || innerWidth < 900; viewButton.setAttribute('aria-expanded', String(open)); render(); renderIssue(); loadNotes(issue.id);
      if (scroll && issue.target.selector) {
        locate(issue);
        if (document.readyState !== 'complete') addEventListener('load', () => { if (selected?.id === issue.id && open) locate(issue); }, { once: true });
      }
      await load(scroll && !keepPosition ? issue.id : null, true); positionDraft();
      if (scroll && !keepPosition && !panel.hidden && selected?.id === issue.id) { panel.querySelector(`[data-issue="${issue.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); captureListScroll(); saveView(); }
    }
    catch (error) { if (ticket === issueRequest) message(error.message); }
    finally { if (openingIssue === ticket) { openingIssue = 0; panel.querySelector('.issue-list')?.setAttribute('aria-busy', String(listLoading || !stylesReady)); } }
  }
  function closeLightbox() {
    viewerRequest++;
    if (lightbox.open) lightbox.close();
    lightbox.replaceChildren();
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function clearAttachments() {
    closeLightbox(); previewIssueId = null;
    for (const entry of attachmentCache.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    attachmentCache.clear();
  }
  function attachmentData(file) {
    const cached = attachmentCache.get(file.id);
    if (cached) return cached.promise;
    const entry = { url: null, promise: null };
    entry.promise = (async () => {
      const blob = await (await api('files/' + file.id)).blob();
      if (attachmentCache.get(file.id) !== entry) throw new Error('Preview cancelled.');
      entry.url = URL.createObjectURL(blob);
      return { url: entry.url, blob };
    })().catch(error => { if (attachmentCache.get(file.id) === entry) attachmentCache.delete(file.id); throw error; });
    attachmentCache.set(file.id, entry);
    return entry.promise;
  }
  function downloadAttachment(file, url) {
    const link = el('a', { href: url, download: file.name }); root.append(link); link.click(); link.remove();
  }
  async function openAttachment(file, trigger) {
    const ticket = ++viewerRequest; returnFocus = trigger;
    const body = el('div', { class: 'lightbox-body', role: 'status' }, 'Loading preview…');
    const toolbar = el('div', { class: 'lightbox-tools' }, button(icon('close'), closeLightbox, { class: 'fp-icon-button', 'aria-label': 'Dismiss attachment', title: 'Dismiss', 'data-tooltip-shortcut': 'Esc' }));
    const comment = selected?.activity.find(event => event.kind === 'reply' && event.id === file.comment_id);
    const author = !file.comment_id || file.comment_id === selected?.id ? selected?.author : comment?.payload.author;
    const heading = el('div', { class: 'lightbox-heading' }, el('strong', {}, file.screenshot ? 'Screenshot' : file.name), el('small', { class: 'lightbox-author' }, author ? 'By ' + author : 'Author unavailable'));
    lightbox.replaceChildren(el('header', { class: 'lightbox-header' }, heading, toolbar), body);
    if (!lightbox.open) lightbox.showModal();
    try {
      const data = await attachmentData(file);
      if (!lightbox.open || ticket !== viewerRequest) return;
      toolbar.prepend(button('Download', () => downloadAttachment(file, data.url), { class: 'fp-quiet' }));
      body.removeAttribute('role');
      if (file.mime.startsWith('image/')) body.replaceChildren(el('img', { src: data.url, alt: file.name, class: 'lightbox-image' }));
      else if (file.mime === 'application/pdf') {
        toolbar.prepend(el('a', { href: data.url, target: '_blank', rel: 'noopener', class: 'pdf-open' }, 'Open PDF'));
        body.replaceChildren(el('iframe', { src: data.url, title: 'PDF preview: ' + file.name, class: 'lightbox-pdf' }), el('small', { class: 'pdf-fallback' }, 'If the preview is unavailable, use Open PDF or Download.'));
      } else body.replaceChildren(el('p', {}, 'Preview unavailable. Use Download to open this file.'));
    } catch (error) {
      if (lightbox.open && ticket === viewerRequest) body.replaceChildren(el('p', { role: 'alert' }, error.message), button('Retry', () => openAttachment(file, trigger)));
    }
  }
  function attachmentThumbnail(file) {
    const caption = file.screenshot ? 'Screenshot' : file.name;
    const thumbnail = button('', () => openAttachment(file, thumbnail), { class: 'attachment-thumbnail', 'aria-label': 'Preview ' + caption, title: caption, disabled: !file.available });
    if (!file.available) { thumbnail.append(el('span', { class: 'file-placeholder' }, icon('document')), el('small', {}, caption), el('small', { class: 'file-state' }, file.expired ? 'Expired' : 'Waiting for sync')); return thumbnail; }
    if (file.mime.startsWith('image/')) {
      const image = el('img', { alt: caption, class: 'attachment-image', loading: 'lazy' });
      const placeholder = el('span', { class: 'file-placeholder' }, icon('image'));
      thumbnail.append(placeholder, el('small', {}, caption));
      attachmentData(file).then(data => { if (thumbnail.isConnected) { image.src = data.url; placeholder.replaceWith(image); } }).catch(() => { if (thumbnail.isConnected) thumbnail.dataset.tooltip = caption + ' — click to retry preview'; });
    } else thumbnail.append(el('span', { class: 'file-placeholder' }, icon('document'), el('span', {}, file.mime === 'application/pdf' ? 'PDF' : 'File')), el('small', {}, caption));
    return thumbnail;
  }
  lightbox.addEventListener('cancel', event => { event.preventDefault(); closeLightbox(); });
  lightbox.addEventListener('click', event => { if (event.target === lightbox) { const rect = lightbox.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeLightbox(); } });
  addEventListener('pagehide', () => { captureListScroll(); saveView(); clearAttachments(); });
  async function editAuthor(trigger, issue) {
    try {
      const people = await (await api('authors')).json();
      if (selected?.id !== issue.id || !trigger.isConnected) return;
      const group = el('div', { class: 'author-picker' });
      const choose = el('select', { 'aria-label': 'Issue author' }, ...people.map(person => el('option', { value: person.id }, person.name + (person.email_identified === false ? ' (name only)' : ''))), el('option', { value: '__new' }, 'Add person…'));
      if (issue.target_conflict) issuePopup.append(el('p', { class: 'warning' }, 'The pin moved on more than one site. Drag it to the intended location to resolve.'));
    if (issue.author_conflict) choose.prepend(el('option', { value: '', disabled: true }, 'Choose author…'));
      choose.value = issue.author_conflict ? '' : issue.author_id || people.find(person => person.name === issue.author)?.id || '';
      const cancel = button(icon('close'), () => renderIssue(), { class: 'fp-icon-button', 'aria-label': 'Cancel author change' });
      const assign = async id => {
        const updated = await (await api(`issues/${issue.id}/author`, { method: 'POST', body: { author_id: id, revision: issue.author_revision } })).json();
        if (selected?.id !== issue.id) return;
        selected = updated; keepListOrder = true;
        issues = issues.map(item => item.id === updated.id ? updated : item); pageIssues = pageIssues.map(item => item.id === updated.id ? updated : item);
        if (open) render(); renderIssue();
      };
      choose.addEventListener('change', () => {
        if (choose.value !== '__new') { perform(group, () => assign(choose.value)); return; }
        const personName = el('input', { required: true, maxlength: 120, placeholder: 'Name', 'aria-label': 'New author name' });
        const personEmail = el('input', { required: true, type: 'email', maxlength: 254, placeholder: 'Email address', 'aria-label': 'New author email' });
        const form = el('form', { class: 'author-add', onsubmit: event => { event.preventDefault(); perform(form, async () => { const person = await (await api('authors', { method: 'POST', body: { name: personName.value, email: personEmail.value } })).json(); await assign(person.id); }); } }, personName, personEmail, el('button', { type: 'submit', class: 'fp-primary' }, 'Set author'));
        group.querySelector('.author-add')?.remove(); group.append(form); personName.focus();
      });
      group.append(choose, cancel); trigger.replaceWith(group); choose.focus();
    } catch (error) { message(error.message); }
  }
  function editComment(comment) {
    if (!selected || actorId !== comment.author_id) return;
    editDrafts.set(comment.id, { issue: selected.id, body: comment.body, title: comment.title || '', revision: comment.edit_revision });
    renderIssue(); issuePopup.querySelector(`[data-edit-comment="${comment.id}"] textarea`)?.focus();
  }
  function commentEditor(comment, draft) {
    const form = el('form', { class: 'comment-editor', 'data-edit-comment': comment.id, onsubmit: event => {
      event.preventDefault();
      perform(form, async () => {
        let updated;
        try { updated = await (await api(`issues/${draft.issue}/comments/${comment.id}`, { method: 'POST', body: { author: name, author_email: email, body: draft.body, ...(comment.id === draft.issue ? { title: draft.title } : {}), revision: draft.revision } })).json(); }
        catch (error) { if (error.status === 409) { draft.stale = true; if (selected?.id === draft.issue) renderIssue(); } throw error; }
        editDrafts.delete(comment.id); notice.hidden = true; keepListOrder = true;
        issues = issues.map(item => item.id === updated.id ? updated : item); pageIssues = pageIssues.map(item => item.id === updated.id ? updated : item);
        if (selected?.id === updated.id) { selected = updated; if (!issuePopup.hidden) renderIssue(); }
        if (open) render(); drawPins(); positionDraft();
        await load(null, true);
      });
    } });
    if (draft.stale) form.append(el('p', { class: 'warning' }, 'A newer edit exists. Your draft is kept below.'), button('Discard draft and reload', () => perform(form, async () => { const current = await (await api('issues/' + draft.issue)).json(); if (selected?.id !== draft.issue) return; selected = current; notice.hidden = true; const latest = comment.id === current.id ? current : current.activity.find(event => event.id === comment.id)?.payload; if (latest && latest.author_id === actorId) editComment({ ...latest, id: comment.id }); else { editDrafts.delete(comment.id); renderIssue(); } }), { class: 'fp-quiet' }));
    if (comment.id === draft.issue) form.append(el('input', { value: draft.title, required: true, maxlength: 120, 'aria-label': 'Edit issue title', oninput: event => { draft.title = event.target.value; } }));
    form.append(el('textarea', { rows: 3, required: comment.id !== draft.issue, maxlength: 10000, 'aria-label': 'Edit comment', 'aria-keyshortcuts': 'Meta+Enter Control+Enter', oninput: event => { draft.body = event.target.value; } }, draft.body), el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'fp-primary', disabled: !!draft.stale, title: 'Save comment', 'data-tooltip-shortcut': submitShortcut }, 'Save'), button('Cancel', () => { editDrafts.delete(comment.id); notice.hidden = true; renderIssue(); }, { class: 'fp-quiet' })));
    return form;
  }
  function commentView(comment, files) {
    const author = comment.id === selected?.id ? button(comment.author || 'Unknown author', event => editAuthor(event.currentTarget, comment), { class: 'comment-author author-edit', 'aria-label': 'Change author: ' + comment.author, title: 'Change author' }) : el('strong', { class: 'comment-author' }, comment.author || 'Unknown author');
    const byline = el('div', { class: 'comment-byline' }, author);
    const date = new Date(comment.created_at);
    if (!Number.isNaN(date.valueOf())) byline.append(el('time', { class: 'comment-date', datetime: comment.created_at, title: date.toLocaleString() }, date.toLocaleDateString()));
    if (comment.edited_at) byline.append(el('time', { class: 'comment-edited', datetime: comment.edited_at, title: 'Edited ' + new Date(comment.edited_at).toLocaleString() }, 'Edited'));
    if (actorId && actorId === comment.author_id) byline.append(button('Edit', () => editComment(comment), { class: 'comment-edit', 'aria-label': comment.id === selected?.id ? 'Edit issue' : 'Edit reply' }));
    const uploads = files.filter(file => !file.screenshot);
    const screenshots = files.filter(file => file.screenshot);
    const draft = editDrafts.get(comment.id);
    const copy = el('div', { class: 'comment-copy' }, byline, comment.edit_conflict ? el('p', { class: 'warning' }, 'This comment has competing edits. Edit and save to resolve them.') : null, ...(draft ? [commentEditor(comment, draft)] : [comment.id === selected?.id && comment.title && !comment.title_generated ? el('h3', { class: 'issue-title' }, comment.title) : null, el('p', { class: 'comment' }, comment.body)]));
    if (uploads.length) copy.append(el('div', { class: 'attachment-strip comment-uploads', role: 'group', 'aria-label': 'Comment attachments' }, ...uploads.map(attachmentThumbnail)));
    return el('div', { class: 'thread-comment' + (screenshots.length ? ' has-screenshot' : ''), 'data-comment': comment.id }, copy,
      screenshots.length ? el('div', { class: 'attachment-strip comment-screenshots', role: 'group', 'aria-label': 'Automatic screenshots' }, ...screenshots.map(attachmentThumbnail)) : null);
  }
  async function loadNotes(id) {
    if (!c.privateNotes) return;
    try {
      const data = await (await api(`issues/${id}/notes`)).json();
      privateNotes.set(id, data.notes);
      if (selected?.id === id && !issuePopup.hidden && !busy && !root.activeElement?.matches('input,textarea,select,[contenteditable]')) renderIssue();
    } catch (error) {
      privateNotes.delete(id);
      if (error.status === 403) { c.privateNotes = false; privateNotes.clear(); privateReply.clear(); }
    }
  }
  function privateNoteView(note) {
    const byline = el('div', { class: 'comment-byline' }, el('strong', { class: 'comment-author' }, note.author_kind === 'agent' ? note.agent + ' for ' + note.author_name : note.author_name), el('span', { class: 'private-label' }, note.author_kind === 'agent' ? 'Private agent note' : 'Private note'));
    if (note.author_kind === 'agent') byline.append(button('Convert to my note', event => perform(event.currentTarget.closest('.private-note'), async () => {
      await api(`issues/${selected.id}/notes/${note.id}/convert`, { method: 'POST', body: { revision: note.revision } }); await loadNotes(selected.id); setTimeout(() => { if (selected && !issuePopup.hidden) renderIssue(); }, 0);
    }), { class: 'comment-edit', title: 'Keep this private note and attribute it to you' }));
    return el('div', { class: 'thread-comment private-note' }, el('div', { class: 'comment-copy' }, byline, el('p', { class: 'comment' }, note.body)));
  }
  function renderIssue() {
    const issue = selected; const threadScroll = previewIssueId === issue.id ? issuePopup.querySelector('.issue-thread')?.scrollTop || 0 : 0; issuePopup.dataset.status = issue.status;
    if (previewIssueId !== issue.id) { clearAttachments(); previewIssueId = issue.id; }
    const items = navigationIssues();
    const index = items.findIndex(item => item.id === issue.id);
    issuePopup.replaceChildren(el('header', { class: 'popup-header' }, el('strong', {}, '#' + issue.number), statusControl(issue, 'popup-status'), el('div', { class: 'popup-navigation' },
      button(icon('previous'), () => stepIssue(-1), { class: 'fp-icon-button', 'aria-label': 'Previous issue', title: 'Previous issue', disabled: index <= 0 && listPage <= 1 }),
      button(icon('next'), () => stepIssue(1), { class: 'fp-icon-button', 'aria-label': 'Next issue', title: 'Next issue', disabled: index >= items.length - 1 && listPage * 50 >= total }),
      button(icon('close'), () => { if (!busy) { closeIssue(); (panel.hidden ? viewButton : panel.querySelector('[aria-label="Dismiss issues"]')).focus(); } }, { class: 'fp-icon-button', 'aria-label': 'Dismiss issue' }))));
    if (issue.author_conflict) issuePopup.append(el('p', { class: 'warning' }, 'The author changed on more than one site. Choose the author again to resolve.'));
    if (issue.conflict) issuePopup.append(el('p', { class: 'warning' }, 'Conflicting status changes: ' + issue.status_choices.map(choice => `${labels[choice.status]} (${choice.author})`).join('; ') + '. Choose a status to resolve.'));
    const replies = issue.activity.filter(event => event.kind === 'reply');
    const filesFor = id => issue.files.filter(file => (file.comment_id || issue.id) === id);
    const thread = el('div', { class: 'issue-thread', 'aria-label': 'Conversation' }, commentView(issue, filesFor(issue.id)));
    for (const event of replies) thread.append(commentView({ ...event.payload, id: event.id, created_at: event.created_at }, filesFor(event.id)));
    for (const note of c.privateNotes ? privateNotes.get(issue.id) || [] : []) thread.append(privateNoteView(note));
    const known = new Set([issue.id, ...replies.map(event => event.id)]);
    const unmatched = issue.files.filter(file => !known.has(file.comment_id || issue.id));
    if (unmatched.length) thread.append(el('div', { class: 'attachment-strip', role: 'group', 'aria-label': 'Uploads awaiting comment sync' }, ...unmatched.map(attachmentThumbnail)));
    issuePopup.append(thread);
    const pending = pendingReplyIds.has(issue.id);
    const reply = el('textarea', { name: 'body', rows: 2, maxlength: 10000, required: !pending, disabled: pending, placeholder: pending ? 'Reply saved. Retry the remaining uploads.' : 'Reply…', 'aria-label': 'Reply', 'aria-keyshortcuts': 'Meta+Enter Control+Enter', oninput: event => replyDrafts.set(issue.id, event.target.value) }); reply.value = replyDrafts.get(issue.id) || '';
    const files = replyFiles.get(issue.id) || []; replyFiles.set(issue.id, files);
    const queued = el('div', { class: 'attached-files reply-queued', 'aria-live': 'polite' });
    function renderQueued() {
      queued.replaceChildren(...files.map((file, index) => el('div', { class: 'attached-file' }, el('small', {}, file.name), button(icon('close'), () => {
        files.splice(index, 1);
        if (!files.length && pendingReplyIds.has(issue.id)) { pendingReplyIds.delete(issue.id); renderIssue(); }
        else renderQueued();
      }, { class: 'fp-icon-button', 'aria-label': 'Remove ' + file.name })))); positionDraft();
    }
    const input = el('input', { type: 'file', name: 'files', multiple: true, class: 'visually-hidden', accept: 'image/png,image/jpeg,image/webp,application/pdf', 'aria-label': 'Issue attachments' });
    input.addEventListener('change', () => {
      for (const file of input.files) {
        if (file.size > c.maxBytes) { message(`${file.name} exceeds 5 MB.`); continue; }
        if (!files.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) files.push(file);
      }
      input.value = ''; renderQueued();
    });
    renderQueued();
    const privateToggle = c.privateNotes ? el('label', { class: 'private-reply-toggle' }, el('input', { type: 'checkbox', checked: privateReply.has(issue.id), onchange: event => { if (event.target.checked) privateReply.add(issue.id); else privateReply.delete(issue.id); input.disabled = event.target.checked; reply.placeholder = event.target.checked ? 'Private note, visible only to your WordPress email…' : 'Reply…'; } }), 'Private note') : null;
    input.disabled = privateReply.has(issue.id); reply.placeholder = privateReply.has(issue.id) ? 'Private note, visible only to your WordPress email…' : reply.placeholder;
    issuePopup.append(el('form', { class: 'reply-form', onsubmit: event => {
      if (!privateReply.has(issue.id)) return submitReply(event, issue.id);
      event.preventDefault(); if (files.length) { message('Remove queued attachments before leaving a private note.'); return; }
      perform(event.currentTarget, async () => {
        await api(`issues/${issue.id}/notes`, { method: 'POST', body: { body: reply.value, kind: 'human' } });
        replyDrafts.delete(issue.id); await loadNotes(issue.id);
      }).then(saved => { if (saved && selected?.id === issue.id && !issuePopup.hidden) renderIssue(); });
    } }, reply, privateToggle, input, queued, el('div', { class: 'reply-actions' }, button(icon('attach'), () => input.click(), { class: 'fp-icon-button', 'aria-label': 'Attach files to reply', title: 'Attach images or PDFs to this reply' }), el('button', { type: 'submit', class: 'fp-primary', title: 'Send reply', 'data-tooltip-shortcut': submitShortcut }, pending ? 'Retry uploads' : 'Reply'))));
    issuePopup.hidden = false; positionDraft(); thread.scrollTop = threadScroll;
  }
  async function perform(form, work) {
    if (busy) return; const session = uiSession; busy = true; form.setAttribute('aria-busy', 'true'); root.querySelectorAll('button, input, textarea, select').forEach(control => { if (!control.disabled) { control.setAttribute('data-fp-busy-disabled', ''); control.disabled = true; } });
    try { await work(); return true; } catch (error) { if (session === uiSession) message(error.message); return false; } finally { busy = false; form.removeAttribute('aria-busy'); root.querySelectorAll('[data-fp-busy-disabled]').forEach(control => { control.disabled = false; control.removeAttribute('data-fp-busy-disabled'); }); }
  }
  async function setStatus(issue, status, control) {
    if (selected?.id === issue.id) issue = selected;
    const session = uiSession;
    const updateInPlace = updated => {
      keepListOrder = true;
      issues = issues.map(existing => existing.id === updated.id ? updated : existing);
      pageIssues = pageIssues.map(existing => existing.id === updated.id ? updated : existing);
      if (selected?.id === updated.id) { selected = updated; if (!issuePopup.hidden) renderIssue(); }
    };
    const saved = await perform(control, async () => {
      const updated = await (await api(`issues/${issue.id}/status`, { method: 'POST', body: { author: name, status, revision: issue.revision } })).json();
      if (session !== uiSession) return;
      updateInPlace(updated);
      if (open) render(); updateNavigation(); drawPins();
      await load(null, true);
    });
    if (!saved && session === uiSession) {
      try {
        const current = await (await api('issues/' + issue.id)).json();
        if (session !== uiSession) return;
        updateInPlace(current);
        if (open) render(); updateNavigation(); drawPins();
        await load(null, true);
      } catch (_) { /* Keep the existing view when the connection is unavailable. */ }
    }
  }
  function submitReply(event, id) {
    event.preventDefault(); const session = uiSession; const form = event.target; const body = new FormData(form).get('body');
    perform(form, async () => {
      let comment = pendingReplyIds.get(id);
      if (!comment) {
        if (!replyOperations.has(id)) replyOperations.set(id, { key: crypto.randomUUID(), revision: selected?.id === id ? selected.revision : issues.find(issue => issue.id === id)?.revision });
        const operation = replyOperations.get(id);
        const saved = await (await api(`issues/${id}/replies`, { method: 'POST', requestId: operation.key, body: { author: name, author_email: email, body, revision: operation.revision } })).json();
        replyOperations.delete(id);
        comment = saved.reply_id; pendingReplyIds.set(id, comment); replyDrafts.delete(id); form.elements.body.value = '';
      }
      const files = replyFiles.get(id) || [];
      try {
        while (files.length) { await upload(id, files[0], false, comment); files.shift(); }
        replyFiles.delete(id); pendingReplyIds.delete(id);
      } finally {
        if (session === uiSession) await showIssue(id, false);
        if (session === uiSession && selected?.id === id) { const thread = issuePopup.querySelector('.issue-thread'); if (thread) thread.scrollTop = thread.scrollHeight; }
      }
    });
  }
  async function upload(id, file, capture = false, comment = null) {
    if (file.size > c.maxBytes) throw new Error(`${file.name} exceeds 5 MB.`);
    const data = new FormData(); data.append('file', file); data.append('screenshot', capture ? '1' : '0');
    if (comment) data.append('comment_id', comment);
    await api(`issues/${id}/files`, { method: 'POST', body: data });
  }
  function renderDraft() {
    const files = [];
    const input = el('input', { type: 'file', name: 'files', 'aria-label': 'Images or PDFs', class: 'visually-hidden', tabindex: '-1', accept: 'image/png,image/jpeg,image/webp,application/pdf', multiple: true });
    const attached = el('div', { class: 'attached-files', 'aria-live': 'polite' });
    function renderFiles() {
      attached.replaceChildren(...files.map((file, index) => el('div', { class: 'attached-file' }, el('small', {}, file.name), button(icon('close'), () => { files.splice(index, 1); renderFiles(); }, { class: 'fp-icon-button', 'aria-label': 'Remove ' + file.name, title: 'Remove ' + file.name }))));
      positionDraft();
    }
    input.addEventListener('change', () => {
      for (const file of input.files) {
        if (file.size > c.maxBytes) { message(`${file.name} exceeds 5 MB.`); continue; }
        if (!files.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) files.push(file);
      }
      input.value = ''; renderFiles();
    });
    const initialStatus = el('input', { type: 'hidden', name: 'status', value: 'todo' });
    const statusPicker = el('div', { class: 'composer-status' });
    const setInitialStatus = status => {
      initialStatus.value = status;
      statusPicker.replaceChildren(statusControl({ status }, 'draft-status', next => { setInitialStatus(next); statusPicker.querySelector(`[data-status-action="${next}"]`).focus(); }));
    };
    setInitialStatus('todo');
    const form = el('form', { onsubmit: submitDraft }, initialStatus,
      el('input', { name: 'title', type: 'text', class: 'composer-title', required: true, maxlength: 120, placeholder: 'Short issue title', 'aria-label': 'Issue title' }),
      el('label', { class: 'visually-hidden', for: 'fp-comment' }, 'What needs to change?'),
      el('div', { class: 'composer-field' },
        el('textarea', { id: 'fp-comment', name: 'body', rows: 3, maxlength: 10000, placeholder: 'Description (optional)…', 'aria-keyshortcuts': 'Meta+Enter Control+Enter' }),
        button(icon('attach'), () => input.click(), { class: 'fp-icon-button attachment-button', 'aria-label': 'Attach files', title: 'Attach images or PDFs (5 MB each)' })),
      input, attached,
      el('div', { class: 'composer-footer' }, el('button', { type: 'submit', class: 'fp-primary', title: 'Submit feedback', 'data-tooltip-shortcut': submitShortcut, 'aria-keyshortcuts': 'Meta+Enter Control+Enter' }, 'Submit feedback')));
    form.feedbackpressFiles = files;
    composer.replaceChildren(el('div', { class: 'composer-top' }, statusPicker, button(icon('close'), () => { if (!busy) startPick(); }, { class: 'fp-icon-button', 'aria-label': 'Close feedback', title: 'Discard this pin' })), form);
    composer.hidden = false; draftPin.hidden = !draft.selector; positionDraft(); form.elements.title.focus();
  }
  function closeDraft() { draft = null; screenshot = null; composer.hidden = true; draftPin.hidden = true; tether.hidden = true; drawPins(); }
  function newDraft(target) {
    if (busy) return;
    cancelPick(); clearAttachments(); selected = null; issuePopup.hidden = true; draft = target; draftOperation = crypto.randomUUID(); open = false; panel.hidden = true; updateChrome(); viewButton.setAttribute('aria-expanded', 'false');
    notice.hidden = true; drawPins(); screenshot = capture(target); renderDraft();
  }
  function positionDraft() {
    const surface = draft ? composer : selected && !issuePopup.hidden ? issuePopup : null;
    const anchor = draft || selected?.target;
    if (!surface || !anchor || surface.hidden) return;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 12, top = (viewport?.offsetTop || 0) + 12;
    const viewportRight = left + (viewport?.width || innerWidth) - 24;
    const right = !panel.hidden && innerWidth >= 900 ? Math.min(viewportRight, panel.getBoundingClientRect().left - 12) : viewportRight;
    const bottom = Math.min(top + (viewport?.height || innerHeight) - 24, (!notice.hidden || !launchers.hidden) ? toolbar.getBoundingClientRect().top - 12 : Infinity);
    surface.style.maxHeight = Math.max(120, Math.min(surface === issuePopup ? 620 : Infinity, bottom - top)) + 'px';
    const rect = targetFor({ target: anchor })?.getBoundingClientRect();
    const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
    const x = clamp(rect ? rect.left + rect.width * anchor.x : (left + right) / 2, left, right);
    const y = clamp(rect ? rect.top + rect.height * anchor.y : top + 70, top, bottom);
    const { width, height } = surface.getBoundingClientRect();
    let boxX, boxY, horizontal = true;
    if (x + 22 + width <= right) { boxX = x + 22; boxY = clamp(y - 24, top, bottom - height); }
    else if (x - 22 - width >= left) { boxX = x - 22 - width; boxY = clamp(y - 24, top, bottom - height); }
    else { horizontal = false; boxX = clamp(x - width / 2, left, right - width); boxY = y + 22 + height <= bottom ? y + 22 : clamp(y - 22 - height, top, bottom - height); }
    Object.assign(surface.style, { left: boxX + 'px', top: boxY + 'px' });
    Object.assign(draftPin.style, { left: x + 'px', top: y + 'px' });
    tether.hidden = true;
    if (horizontal) Object.assign(tether.style, { left: Math.min(x, boxX > x ? boxX : boxX + width) + 'px', top: y + 'px', width: '22px', height: '2px' });
    else {
      const edge = boxY > y ? boxY : boxY + height;
      Object.assign(tether.style, { left: x + 'px', top: Math.min(y, edge) + 'px', width: '2px', height: Math.abs(edge - y) + 'px' });
    }
  }
  async function submitDraft(e) {
    e.preventDefault(); const session = uiSession; const capturePromise = screenshot; const target = draft; const form = e.target; const data = new FormData(form); const files = [...form.feedbackpressFiles];
    if (files.some(f => f.size > c.maxBytes)) return message('Each attachment must be 5 MB or smaller.');
    perform(form, async () => {
      const issue = await (await api('issues', { method: 'POST', requestId: draftOperation, body: { author: name, author_email: email, title: data.get('title'), status: data.get('status'), body: data.get('body'), path: pagePath, target, viewport: `${innerWidth} × ${innerHeight}` } })).json();
      requestNumber++;
      const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (filter.includes(issue.status) && terms.every(term => ((issue.title || '') + ' ' + issue.body).toLowerCase().includes(term))) {
        pageIssues = [...pageIssues.filter(existing => existing.id !== issue.id), issue];
        if (keepListOrder && !issues.some(existing => existing.id === issue.id)) { issues.push(issue); total++; }
      }
      if (session === uiSession) draftPin.hidden = true;
      drawPins();
      const errors = [];
      const image = await capturePromise;
      if (image) { try { await upload(issue.id, image, true); } catch (error) { errors.push(error.message); } } else errors.push('Automatic screenshot was unavailable. You can attach one manually.');
      for (const file of files) { try { await upload(issue.id, file); } catch (error) { errors.push(error.message); } }
      if (session !== uiSession) return;
      closeDraft(); await load(null, true);
      if (session !== uiSession) return;
      picking = true; drawPins();
      message((errors.length ? 'Feedback saved. ' + errors.join(' ') + ' ' : 'Feedback saved. ') + 'Click to drop another pin. Press C or Escape to exit.'); launcher.focus();
    });
  }
  async function capture(target) {
    try {
      const width = innerWidth, height = innerHeight;
      const rect = targetFor({ target })?.getBoundingClientRect();
      const point = rect ? { x: rect.left + rect.width * target.x, y: rect.top + rect.height * target.y } : null;
      // The renderer replaces videos with unstyled canvases; retain their layout in the clone.
      const videos = [...document.querySelectorAll('video')].map(video => {
        const styles = getComputedStyle(video);
        return { parent: selector(video.parentElement), index: [...video.parentElement.children].filter(node => ['VIDEO', 'CANVAS'].includes(node.tagName)).indexOf(video), styles: [...styles].map(property => [property, styles.getPropertyValue(property)]) };
      });
      const canvas = await Promise.race([(window.html2canvas.default || window.html2canvas)(document.body, { useCORS: true, logging: false, backgroundColor: '#ffffff', scale: Math.min(devicePixelRatio, 1.5), x: scrollX, y: scrollY, width, height, onclone: doc => {
        doc.querySelectorAll('input,textarea,select,[data-feedbackpress-private]').forEach(n => { n.style.visibility = 'hidden'; });
        for (const video of videos) {
          const parent = doc.querySelector(video.parent);
          const clone = parent && [...parent.children].filter(node => ['VIDEO', 'CANVAS'].includes(node.tagName))[video.index];
          if (clone) for (const [property, value] of video.styles) clone.style.setProperty(property, value);
        }
      } }), new Promise((_, reject) => setTimeout(() => reject(new Error('Capture timed out')), 12000))]);
      if (point) {
        // Stamp the original click, independent of later layout changes and UI pin clamping.
        const context = canvas.getContext('2d');
        context.save(); context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        context.shadowColor = '#0000004d'; context.shadowBlur = 6; context.shadowOffsetY = 2;
        context.beginPath(); context.arc(point.x, point.y, 12, 0, Math.PI * 2);
        context.fillStyle = '#98711f'; context.fill(); context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.stroke();
        context.shadowColor = 'transparent'; context.beginPath(); context.arc(point.x, point.y, 3, 0, Math.PI * 2); context.fillStyle = '#ffffff'; context.fill();
        context.restore();
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
      return blob && blob.size <= c.maxBytes ? new File([blob], 'screenshot.jpg', { type: 'image/jpeg' }) : null;
    } catch (_) { return null; }
  }
  function selector(node) {
    const parts = [];
    while (node && node !== document.body && parts.length < 12) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const siblings = [...node.parentElement.children].filter(n => n.tagName === node.tagName);
      parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : '')); node = node.parentElement;
    }
    return parts.join(' > ') || 'body';
  }
  function startPick() { if (busy) return; closeStatusFilter(); issueRequest++; openingIssue = 0; clearAttachments(); selected = null; issuePopup.hidden = true; closeDraft(); identity.hidden = true; open = false; viewButton.setAttribute('aria-expanded', 'false'); picking = true; panel.hidden = true; updateChrome(); drawPins(); message('Click an element, or press P for page feedback. C or Escape exits.'); }
  function cancelPick() { picking = false; highlight.hidden = true; }
  document.addEventListener('pointermove', event => {
    if (!picking || event.composedPath().includes(host)) return;
    const rect = event.target.getBoundingClientRect(); highlight.hidden = false; Object.assign(highlight.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  }, true);
  document.addEventListener('click', event => {
    if (!picking || event.composedPath().includes(host)) return;
    event.preventDefault(); event.stopImmediatePropagation(); const target = event.target; const rect = target.getBoundingClientRect(); notice.hidden = true;
    newDraft({ selector: selector(target), text: (target.textContent || target.getAttribute('alt') || target.tagName).trim().slice(0, 240), x: rect.width ? (event.clientX - rect.left) / rect.width : .5, y: rect.height ? (event.clientY - rect.top) / rect.height : .5 });
  }, true);
  function dismissInterface() {
    closeStatusFilter(); uiSession++; issueRequest++; openingIssue = 0;
    selected = null; open = false; cancelPick(); closeDraft(); clearAttachments();
    identity.hidden = true; panel.hidden = true; issuePopup.hidden = true; notice.hidden = true;
    viewButton.setAttribute('aria-expanded', 'false'); updateChrome(); drawPins(); launcher.focus(); hideTooltip();
  }
  window.addEventListener('keydown', event => {
    if (event.isComposing) return;
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Escape' || event.key === 'Esc') {
      hideTooltip();
      const editForm = event.composedPath().find(node => node instanceof Element)?.closest('[data-edit-comment]');
      if (editForm) { consume(); editDrafts.delete(editForm.dataset.editComment); notice.hidden = true; renderIssue(); return; }
      if (pinDrag && !pinDrag.ending) { consume(); cancelPinDrag(); return; }
      if (lightbox.open) { consume(); closeLightbox(); }
      else if (filterOpen) { consume(); closeStatusFilter(true); }
      else if (openingIssue || picking || draft || selected || open || !identity.hidden || !notice.hidden) { consume(); dismissInterface(); }
      return;
    }
    if (busy || lightbox.open || filterOpen || event.repeat) return;
    const target = event.composedPath().find(node => node instanceof Element);
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      const form = target?.closest('form');
      if (form?.getRootNode() === root && form.querySelector('[type=submit]')) { consume(); form.requestSubmit(); }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (document.designMode === 'on' || event.composedPath().some(node => node instanceof Element && (node.isContentEditable || node.matches('input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [role="slider"], [role="listbox"], [role="grid"], [role="tree"]')))) return;
    const key = event.key.toLowerCase();
    if (key === 'c') { consume(); if (picking || draft || !identity.hidden) dismissInterface(); else launcher.click(); return; }
    if (key === 'v') { consume(); viewButton.click(); return; }
    if (picking && event.key.toLowerCase() === 'p') { consume(); newDraft({ selector: '', text: 'Page feedback', x: .5, y: .5 }); return; }
    if (!selected || draft || picking) return;
    const status = Object.keys(statusKeys).find(value => statusKeys[value] === event.key);
    if (!status || (selected.status === status && !selected.conflict)) return;
    const control = (!panel.hidden && panel.querySelector(`[data-issue="${selected.id}"] [data-status-action="${status}"]`)) || issuePopup.querySelector(`[data-status-action="${status}"]`) || issuePopup;
    if (control.disabled) return;
    consume(); setStatus(selected, status, control);
  }, true);
  function targetFor(issue) { try { return issue.target.selector ? document.querySelector(issue.target.selector) : null; } catch (_) { return null; } }
  function locate(issue) {
    const target = targetFor(issue);
    if (!target) return message('The original element has changed or is missing. Use the screenshot for context.');
    let rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const y = Number.isFinite(Number(issue.target.y)) ? Math.max(0, Math.min(1, Number(issue.target.y))) : .5;
    const ancestors = [];
    for (let node = target; node; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return;
      if (node !== target && node !== document.body && node !== document.documentElement) ancestors.push(node);
    }
    // Reveal the saved point inside nested scrollers before positioning the document.
    for (const node of ancestors) {
      if (!/^(auto|scroll)$/.test(getComputedStyle(node).overflowY) || node.scrollHeight <= node.clientHeight) continue;
      rect = target.getBoundingClientRect();
      node.scrollTo({ top: node.scrollTop + rect.top + rect.height * y - node.getBoundingClientRect().top - node.clientTop - node.clientHeight / 2, behavior: 'instant' });
    }
    rect = target.getBoundingClientRect();
    window.scrollTo({ top: scrollY + rect.top + rect.height * y - innerHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function dropTarget(x, y) {
    const node = document.elementFromPoint(x, y);
    if (!node || node === host || node === document.documentElement || node === document.body || host.contains(node)) return null;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { node, rect, target: { selector: selector(node), text: (node.textContent || node.getAttribute('alt') || node.tagName).trim().slice(0, 240), x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)) } };
  }
  function beginPinDrag(event, pin, issue) {
    if (busy || lightbox.open || event.button !== 0 || !event.isPrimary) return;
    if (!name || (!c.userName && !email)) { withIdentity(() => message('Drag the pin to its new location.')); return; }
    event.preventDefault(); pin.focus({ preventScroll: true });
    pinDrag = { pin, issue, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, ending: false };
    pin.setPointerCapture(event.pointerId);
  }
  function cancelPinDrag() {
    const drag = pinDrag; if (!drag) return;
    pinDrag = null; highlight.hidden = true;
    if (drag.pin.hasPointerCapture(drag.pointer)) drag.pin.releasePointerCapture(drag.pointer);
    if (drag.moved) { suppressedPin = drag.pin; setTimeout(() => { if (suppressedPin === drag.pin) suppressedPin = null; }, 500); }
    drawPins(); positionDraft();
  }
  window.addEventListener('pointermove', event => {
    const drag = pinDrag;
    if (!drag || drag.ending || event.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true; notice.hidden = true; event.preventDefault(); event.stopPropagation(); hideTooltip();
    drag.pin.classList.add('is-dragging'); drag.pin.style.pointerEvents = 'none';
    drag.pin.style.left = event.clientX + 'px'; drag.pin.style.top = event.clientY + 'px';
    const drop = dropTarget(event.clientX, event.clientY); highlight.hidden = !drop;
    if (drop) Object.assign(highlight.style, { left: drop.rect.left + 'px', top: drop.rect.top + 'px', width: drop.rect.width + 'px', height: drop.rect.height + 'px' });
  }, { capture: true, passive: false });
  window.addEventListener('pointerup', async event => {
    const drag = pinDrag;
    if (!drag || drag.ending || event.pointerId !== drag.pointer) return;
    if (!drag.moved) { pinDrag = null; return; }
    drag.ending = true; event.preventDefault(); event.stopPropagation();
    suppressedPin = drag.pin; setTimeout(() => { if (suppressedPin === drag.pin) suppressedPin = null; }, 500);
    if (drag.pin.hasPointerCapture(drag.pointer)) drag.pin.releasePointerCapture(drag.pointer);
    const drop = dropTarget(event.clientX, event.clientY); highlight.hidden = true;
    if (!drop) { cancelPinDrag(); return; }
    try {
      await perform(drag.pin, async () => {
        const updated = await (await api(`issues/${drag.issue.id}/target`, { method: 'POST', body: { author: name, target: drop.target, revision: drag.issue.target_revision } })).json();
        keepListOrder = true;
        issues = issues.map(item => item.id === updated.id ? updated : item);
        pageIssues = pageIssues.map(item => item.id === updated.id ? updated : item);
        if (selected?.id === updated.id) { selected = updated; if (!issuePopup.hidden) renderIssue(); }
        if (open) render();
      });
    } finally { pinDrag = null; drawPins(); positionDraft(); }
  }, true);
  window.addEventListener('dragstart', event => { if (pinDrag) event.preventDefault(); }, true);
  window.addEventListener('pointercancel', event => { if (pinDrag && !pinDrag.ending && event.pointerId === pinDrag.pointer) cancelPinDrag(); }, true);
  window.addEventListener('click', event => { if (suppressedPin && event.composedPath().includes(suppressedPin)) { event.preventDefault(); event.stopImmediatePropagation(); suppressedPin = null; } }, true);
  function drawPins() {
    if (pinDrag) return;
    pins.replaceChildren();
    const visible = pageIssues.filter(issue => filter.includes(issue.status));
    if (selected && !visible.some(issue => issue.id === selected.id)) visible.push(selected);
    visible.filter(i => i.path === pagePath && i.target.selector).forEach(issue => {
      const target = targetFor(issue); if (!target) return;
      const rect = target.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      const pin = button(String(issue.number), () => withIdentity(() => showIssue(issue.id)), { class: 'pin ' + (String(issue.number).length > 4 ? 'is-wide ' : '') + issue.status + (selected?.id === issue.id ? ' is-selected' : ''), 'aria-label': `Issue ${issue.number}, ${labels[issue.status]}: ${(issue.title || issue.body).slice(0, 90)}` }); pin.addEventListener('pointerdown', event => beginPinDrag(event, pin, issue)); pin.dataset.tooltip = 'Click to open · drag to move'; pin.style.left = `${rect.left + rect.width * issue.target.x}px`; pin.style.top = `${rect.top + rect.height * issue.target.y}px`; pins.append(pin);
    });
  }
  let frame = null;
  const redraw = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = null; if (open && selected && !issuePopup.hidden) panel.hidden = innerWidth < 900; updateChrome(); drawPins(); positionDraft(); }); };
  new ResizeObserver(() => positionDraft()).observe(issuePopup);
  new ResizeObserver(() => positionDraft()).observe(composer);
  new ResizeObserver(() => positionDraft()).observe(toolbar);
  addEventListener('scroll', redraw, { passive: true }); addEventListener('resize', redraw);
  addEventListener('load', redraw);
  // Page builders can reveal the saved element after the initial page/API load.
  new MutationObserver(records => { if (records.some(record => !host.contains(record.target))) redraw(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'id'], characterData: true });
  new ResizeObserver(redraw).observe(document.body);
  document.addEventListener('load', event => { if (!host.contains(event.target)) redraw(); }, true);
  if (window.FontFace && document.fonts) {
    try {
      const font = new FontFace('FeedbackPress Inter', `url("${new URL('fonts/InterVariable.woff2', new URL(c.css, document.baseURI)).href}")`, { weight: '100 900', display: 'swap' });
      document.fonts.add(font); font.load().then(redraw).catch(() => {});
    } catch (_) { /* System sans remains available when a browser cannot load the bundled font. */ }
  }
  document.fonts?.ready.then(redraw);
  window.visualViewport?.addEventListener('resize', redraw);
  window.visualViewport?.addEventListener('scroll', redraw);
  addEventListener('hashchange', () => { const linked = location.hash.match(/^#feedbackpress=([a-f0-9-]{36})$/)?.[1]; if (linked) withIdentity(() => showIssue(linked)); });
  const id = location.hash.match(/^#feedbackpress=([a-f0-9-]{36})$/)?.[1];
  if (id) withIdentity(() => showIssue(id)); else if (resumeOpen || new URLSearchParams(location.search).get('feedbackpress') === 'open') withIdentity(() => toggle(true));
  if (name && !c.userName) remember(name);
  let syncTimer = null, syncBusy = false, syncAttempt = 0, lastActivity = Date.now(), syncCursor = c.cursor || 0, deferredIssueRender = false;
  function activity() {
    if (!c.activitySync) return;
    lastActivity = Date.now();
    if (!syncTimer && !syncBusy) syncActivity();
  }
  async function syncActivity() {
    clearTimeout(syncTimer); syncTimer = null;
    if (syncBusy || document.hidden || Date.now() - lastActivity > 120000) return;
    const wait = 60000 - (Date.now() - syncAttempt);
    if (wait > 0) { syncTimer = setTimeout(syncActivity, wait + 50); return; }
    syncBusy = true; syncAttempt = Date.now(); const writeVersion = localWriteVersion;
    try {
      if (selected && c.privateNotes) loadNotes(selected.id);
      const data = await (await api('sync/activity', { method: 'POST', body: { since: syncCursor } })).json();
      if (c.network && data.network !== c.network) { message('The feedback network changed. Reload this page to continue.'); return; }
      if (Array.isArray(data.issues) && writeVersion === localWriteVersion) {
        const byId = new Map(data.issues.map(issue => [issue.id, issue]));
        const matches = issue => filter.includes(issue.status) && search.trim().split(/\s+/).filter(Boolean).every(term => [issue.title || '', issue.body, ...issue.activity.filter(event => event.kind === 'reply').map(event => event.payload.body)].join('\n').toLocaleLowerCase().includes(term.toLocaleLowerCase()));
        const visible = new Set(issues.map(issue => issue.id));
        // Keep each visible row in place, including status changes received from another site.
        issues = issues.filter(issue => byId.has(issue.id)).map(issue => byId.get(issue.id));
        for (const id of data.new_issues || []) { const issue = byId.get(id); if (issue && !visible.has(id) && matches(issue)) { issues.push(issue); total++; } }
        keepListOrder = listLoaded;
        pageIssues = data.issues.filter(issue => issue.path === pagePath && matches(issue));
        const editing = root.activeElement?.matches('input, textarea, select, [contenteditable]') || draft || busy;
        if (selected && byId.has(selected.id)) { selected = byId.get(selected.id); deferredIssueRender = Boolean(editing); if (!editing && !issuePopup.hidden) renderIssue(); }
        if (!editing) {
          if (open) render();
          updateNavigation();
        }
        drawPins(); syncCursor = data.cursor;
      }
    } catch (_) { /* Background connection details remain in the bounded server-side sync log. */ }
    finally {
      syncBusy = false;
      if (!document.hidden && Date.now() - lastActivity <= 120000) syncTimer = setTimeout(syncActivity, 60050);
    }
  }
  root.addEventListener('focusout', () => { setTimeout(() => {
    if (deferredIssueRender && !busy && !draft && !root.activeElement?.matches('input, textarea, select, [contenteditable]')) { deferredIssueRender = false; if (selected && !issuePopup.hidden) renderIssue(); if (open) render(); }
  }, 0); });
  root.addEventListener('pointerdown', activity, { passive: true });
  root.addEventListener('keydown', activity);
  window.addEventListener('keydown', event => { if (['c', 'v'].includes(event.key.toLowerCase()) && !event.composedPath().some(node => node instanceof Element && (node.matches('input, textarea, select') || node.isContentEditable))) activity(); });
  document.addEventListener('visibilitychange', () => { clearTimeout(syncTimer); syncTimer = null; if (!document.hidden) activity(); });
  if (c.activitySync) syncActivity();
  if (!requestNumber) load();
})();
