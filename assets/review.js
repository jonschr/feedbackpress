(() => {
  'use strict';
  const c = window.FeedbackPressConfig;
  if (!c || document.getElementById('feedbackpress-root')) return;
  const host = document.createElement('div'); host.id = 'feedbackpress-root'; host.style.visibility = 'hidden';
  host.setAttribute('data-html2canvas-ignore', 'true'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  let stylesReady = false;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = c.css; root.append(css);
  css.addEventListener('load', () => { stylesReady = true; if (open) render(); restoreThreadScroll(); positionDraft(); host.style.visibility = ''; });
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
    path.setAttribute('d', kind === 'close' ? 'M6 6l12 12M18 6L6 18' : kind === 'plus' ? 'M12 5v14M5 12h14' : kind === 'search' ? 'M21 21l-5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0' : kind === 'check' ? 'M5 12l4 4L19 6' : kind === 'todo' ? 'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h6' : kind === 'needs_info' ? 'M21 12a9 9 0 11-18 0 9 9 0 0118 0M9.1 9a3 3 0 015.8 1c0 2-3 2-3 4M12 17h.01' : kind === 'doing' ? 'M8 5l11 7-11 7z' : kind === 'reply' ? 'M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z' : kind === 'document' ? 'M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h6' : kind === 'image' ? 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01' : kind === 'review' ? 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 11-6 0 3 3 0 016 0' : kind === 'previous' ? 'M15 6l-6 6 6 6' : kind === 'next' ? 'M9 6l6 6-6 6' : kind === 'chevron' ? 'M6 9l6 6 6-6' : 'M21 11.5l-8.5 8.5a6 6 0 01-8.5-8.5l9-9a4 4 0 015.7 5.7l-9 9a2 2 0 01-2.8-2.8l8.5-8.5');
    if (kind === 'sort') path.setAttribute('d', 'M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3');
    svg.append(path); return svg;
  }
  const labels = { todo: 'To do', needs_info: 'Information needed', doing: 'Doing', review: 'Review', done: 'Done' };
  const statusKeys = { todo: '1', needs_info: '2', doing: '3', review: '4', done: '5' };
  const submitShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ Enter' : 'Ctrl Enter';
  let name = c.userName || '', email = '', actorId = c.authorId || '', actorRequest = null;
  try { email = decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('feedbackpress_email='))?.slice('feedbackpress_email='.length) || ''); } catch (_) {}
  if (!name) {
    try {
      const saved = document.cookie.split('; ').find(value => value.startsWith('feedbackpress_name='));
      name = saved ? decodeURIComponent(saved.slice('feedbackpress_name='.length)) : localStorage.getItem('feedbackpress-name') || '';
    } catch (_) { /* Identity can still be entered when browser storage is disabled. */ }
  }
  const sortLabels = { created_asc: 'Created: oldest first', created_desc: 'Created: newest first', updated_desc: 'Last edited: newest first', updated_asc: 'Last edited: oldest first', completed_desc: 'Completed: newest first', completed_asc: 'Completed: oldest first' };
  let issues = [], pageIssues = [], selected = null, sort = 'created_asc', scope = 'all', grouping = 'none', scopePath = null, search = '', searchTimer, filter = ['todo', 'needs_info', 'review'], filterOpen = false, open = false, picking = false, busy = false, draft = null, screenshot = null, requestNumber = 0, issueRequest = 0, openingIssue = 0, uiSession = 0, listPage = 1, total = 0;
  const viewKey = 'feedbackpress-view:' + c.home;
  let sidebarSide = 'right', pageLayout = 'overlay';
  let keepListOrder = false, localWriteVersion = 0, pinDrag = null, suppressedPin = null, listLoaded = false, listLoading = true, listError = '', listScroll = 0, hasListPosition = false, resumeOpen = false;
  const editDrafts = new Map();
  const replyDrafts = new Map();
  let imageDropJob = null, imageDropTarget = null, imageDropTimer = null;
  const mentionDrafts = new Map();
  let mentionData = null, mentionRead = null, mentionAt = 0, mentionActive = null, mentionPicker = null, mentionList = null;
  const replyFiles = new Map();
  const replyOperations = new Map();
  const threadScrolls = new Map();
  let statusCounts = null;
  const countedStatuses = new Map();
  let draftOperation = null;
  let shortcutIssueId = null, lastPointer = null, steppingPage = false;
  const privateNotes = new Map();
  let notesRequest = 0;
  const privateReply = new Set();
  const attachmentCache = new Map();
  const rowPreviewQueue = new Set();
  let rowPreviewObserver = null, rowPreviewActive = 0;
  let previewIssueId = null, previewFileId = null, viewerRequest = 0, returnFocus = null;
  try {
    const view = JSON.parse(sessionStorage.getItem(viewKey) || '{}');
    if (Object.hasOwn(sortLabels, view.sort)) sort = view.sort;
    if (view.scope === 'current') scope = 'current';
    if (view.grouping === 'page') grouping = 'page';
    scopePath = view.scopePath;
    if (typeof view.search === 'string') search = view.search;
    if (Array.isArray(view.filter)) filter = Object.keys(labels).filter(status => view.filter.includes(status));
    else if (view.filter === 'all') filter = Object.keys(labels);
    else if (Object.hasOwn(labels, view.filter)) filter = [view.filter];
    if (view.statusVersion !== 5 && Array.isArray(view.filter) && (view.filter.join(',') === 'todo,review' || view.filter.length === 4)) filter = Object.keys(labels).filter(status => status === 'needs_info' || view.filter.includes(status));
    listPage = Math.max(1, Number(view.page) || 1);
    hasListPosition = Number.isFinite(view.scrollTop) && view.scrollTop >= 0;
    listScroll = hasListPosition ? view.scrollTop : 0;
    resumeOpen = view.open === true;
    if (view.sidebarSide === 'left') sidebarSide = 'left';
    if (view.pageLayout === 'room') pageLayout = 'room';
  } catch (_) { /* Storage is optional. */ }
  function saveView() { try { sessionStorage.setItem(viewKey, JSON.stringify({ statusVersion: 5, sort, scope, grouping, scopePath, search, filter, page: listPage, scrollTop: hasListPosition ? listScroll : undefined, open: open || Boolean(openingIssue), sidebarSide, pageLayout })); } catch (_) {} }
  const homePath = new URL(c.home).pathname.replace(/\/$/, '');
  const pagePath = (location.pathname.slice(homePath.length) || '/') + location.search;
  if (scope === 'current' && scopePath !== pagePath) { listPage = 1; listScroll = 0; hasListPosition = false; }
  scopePath = pagePath;
  if (scope === 'current') grouping = 'none';
  const issueCache = new Map(), issueReads = new Map();
  const cacheKey = 'feedbackpress-shared-cache:' + c.home + ':' + (c.network || '') + ':' + (c.authorId || c.userName || 'guest');
  const cacheLifetime = 30000;
  let cacheSaveTimer = null, restoringList = false, restoredSelection = null, restoredDetails = false, cacheDenied = false, knownIssues = null, loadedListSignature = null;
  const listSignature = () => JSON.stringify([sort, grouping, scope, scope === 'current' ? pagePath : '', search, filter, listPage]);
  const freshCache = at => Number.isFinite(at) && Date.now() - at >= 0 && Date.now() - at < cacheLifetime;
  function scheduleCacheSave() { if (!cacheDenied && cacheSaveTimer === null) cacheSaveTimer = setTimeout(persistIssueCache, 0); }
  function persistIssueCache(carryView = false) {
    cacheSaveTimer = null;
    if (cacheDenied) return;
    const visible = issues.filter(issue => !issue.pending);
    const view = listLoaded && loadedListSignature === listSignature() ? { at: Date.now(), signature: listSignature(), ids: visible.map(issue => issue.id), total: total - (issues.length - visible.length), selected: selected?.id, detailOpen: !issuePopup.hidden, counts: statusCounts, pointer: lastPointer, threads: [...threadScrolls].slice(-200) } : null;
    const priority = new Set([selected?.id, ...visible.map(issue => issue.id)]);
    const known = knownIssues ? [...knownIssues] : null, at = Date.now();
    const entries = [], saved = new Set(); let size = JSON.stringify({ entries: [], view, known, at }).length;
    const ordered = [...issueCache.values()].reverse();
    ordered.sort((a, b) => Number(priority.has(b.issue.id)) - Number(priority.has(a.issue.id)));
    for (const entry of ordered) {
      // Carry visible completed rows across navigation without bulk-caching completed history.
      if ((entry.issue.status === 'done' && !priority.has(entry.issue.id)) || entry.issue.pending || (!freshCache(entry.at) && !(carryView && priority.has(entry.issue.id)))) continue;
      const json = JSON.stringify(entry); if (json.length > 256 * 1024 || size + json.length + 1 > 1024 * 1024) continue;
      entries.push(entry); saved.add(entry.issue.id); size += json.length + 1;
    }
    const snapshot = { entries, view: view?.ids.every(id => saved.has(id)) ? view : null, known, at };
    if (JSON.stringify(snapshot).length > 1024 * 1024) return;
    try { sessionStorage.setItem(cacheKey, JSON.stringify(snapshot)); } catch (_) {}
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(cacheKey) || '{}');
    if (freshCache(saved.at) && Array.isArray(saved.known)) knownIssues = new Set(saved.known.slice(0, 10000));
    const view = saved.view;
    const carried = new Set(view && freshCache(view.at) ? [...view.ids, view.selected] : []);
    for (const entry of (saved.entries || []).slice(0, 200)) if (freshCache(entry.at) || carried.has(entry.issue.id)) issueCache.set(entry.issue.id, entry);
    if (view && freshCache(view.at)) {
      if (view.signature === listSignature() && view.counts && Object.keys(labels).every(status => Number.isSafeInteger(view.counts[status]) && view.counts[status] >= 0)) statusCounts = view.counts;
      for (const { issue } of issueCache.values()) countedStatuses.set(issue.id, { status: issue.status, matches: matchesListSearch(issue) });
      if (Number.isFinite(view.pointer?.x) && Number.isFinite(view.pointer?.y)) lastPointer = view.pointer;
      for (const [id, top] of (view.threads || []).slice(-200)) if (Number.isFinite(top) && top >= 0) threadScrolls.set(id, top);
      if (view.signature === listSignature() && view.ids.every(id => issueCache.has(id))) {
        issues = view.ids.map(id => issueCache.get(id).issue); total = view.total;
        listLoaded = true; listLoading = false; restoringList = true; loadedListSignature = view.signature;
        keepListOrder = performance.getEntriesByType('navigation')[0]?.type !== 'reload';
        restoredSelection = view.selected; restoredDetails = view.detailOpen === true;
        selected = issueCache.get(restoredSelection)?.issue || null;
        pageIssues = [...issueCache.values()].map(entry => entry.issue).filter(issue => issue.path === pagePath && matchesView(issue));
      }
    }
  } catch (_) { /* Missing, expired or oversized snapshots fall back to the gateway. */ }
  function cacheIssue(issue) {
    if (cacheDenied || !issue?.id || !issue.target || !Array.isArray(issue.activity) || !Array.isArray(issue.files)) return;
    const previous = issueCache.get(issue.id)?.issue;
    if (previous && Number(previous.revision) > Number(issue.revision)) return;
    issueCache.delete(issue.id); issueCache.set(issue.id, { issue, at: Date.now() });
    while (issueCache.size > 200) issueCache.delete(issueCache.keys().next().value);
    scheduleCacheSave();
  }
  function cacheResponse(data) {
    if (Array.isArray(data?.issues)) data.issues.forEach(cacheIssue);
    else cacheIssue(data);
  }
  function applyIssue(updated) {
    if (cacheDenied) return;
    const known = issueCache.get(updated.id)?.issue;
    if (known && Number(known.revision) > Number(updated.revision)) return;
    cacheIssue(updated); updated = optimisticIssue(updated); updateStatusCount(updated); keepListOrder = true;
    issues = issues.map(existing => existing.id === updated.id ? updated : existing);
    pageIssues = pageIssues.map(existing => existing.id === updated.id ? updated : existing);
    if (selected?.id === updated.id) {
      const changed = JSON.stringify(selected) !== JSON.stringify(updated); selected = updated;
      if (changed && !issuePopup.hidden && !root.activeElement?.matches('input,textarea,select,[contenteditable]')) renderIssue();
    }
    if (open) render(); updateNavigation(); drawPins();
  }
  function readIssue(id) {
    if (!issueReads.has(id)) issueReads.set(id, api('issues/' + id).then(response => response.json()).finally(() => issueReads.delete(id)));
    return issueReads.get(id);
  }
  const panel = el('aside', { class: 'panel', 'aria-label': 'Issues', 'data-continuing': resumeOpen ? true : null, hidden: true });
  const panelContents = el('div', { class: 'panel-contents' });
  const sidebarSettings = el('details', { class: 'sidebar-settings' }, el('summary', {}, 'Sidebar settings', icon('chevron')));
  for (const [legend, key, choices] of [['Sidebar side', 'side', [['left', 'Left'], ['right', 'Right']]], ['Page layout', 'layout', [['overlay', 'Overlay page'], ['room', 'Make room']]]]) {
    const group = el('fieldset', {}, el('legend', {}, legend));
    for (const [value, label] of choices) group.append(el('label', {}, el('input', { type: 'radio', name: 'fp-sidebar-' + key, value, checked: value === (key === 'side' ? sidebarSide : pageLayout), onchange: event => {
      if (!event.target.checked) return;
      captureListScroll();
      if (key === 'side') sidebarSide = value; else pageLayout = value;
      updateChrome(); drawPins(); positionDraft();
    } }), label));
    sidebarSettings.append(group);
  }
  sidebarSettings.append(el('p', { class: 'sidebar-narrow-note' }, 'On small screens, the list and page use separate views.'));
  if (c.reviewSession) sidebarSettings.append(button('End review session', event => perform(event.currentTarget, async () => { await api('review-session', { method: 'DELETE' }); dismissInterface(); issueCache.clear(); try { sessionStorage.removeItem(cacheKey); } catch (_) {} location.reload(); }), { class: 'fp-quiet' }));
  sidebarSettings.addEventListener('toggle', () => { captureListScroll(); requestAnimationFrame(() => { const list = panel.querySelector('.issue-list'); if (list) list.scrollTop = listScroll; }); });
  panel.append(panelContents, sidebarSettings);
  const pageLayoutStyle = document.createElement('style');
  // shortcut: viewport units/fixed elements keep browser dimensions; an isolated viewport would be needed to simulate those too.
  pageLayoutStyle.textContent = '@media (min-width:900px){html[data-feedbackpress-room]{box-sizing:border-box!important;width:calc(100% - 400px)!important;min-width:0!important;max-width:calc(100% - 400px)!important;margin-right:0!important;margin-left:0!important}html[data-feedbackpress-room="left"]{margin-left:400px!important}}';
  document.head.append(pageLayoutStyle);
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
  const viewButton = button('View issues', () => withIdentity(() => { if (selected && innerWidth < 900 && panel.hidden) { prepareListReveal(); open = true; viewButton.setAttribute('aria-expanded', 'true'); issuePopup.hidden = true; tether.hidden = true; panel.hidden = false; render(); } else toggle(!open); }), { 'aria-expanded': 'false', title: 'Toggle issues panel', 'data-tooltip-shortcut': 'V', 'aria-keyshortcuts': 'V' });
  const launchers = el('div', { class: 'launcher' }, viewButton, launcher);
  const toolbar = el('div', { class: 'feedback-toolbar' }, notice, launchers);
  function updateChrome() {
    launchers.hidden = open;
    sidebarSettings.querySelectorAll('fieldset').forEach(group => { group.disabled = innerWidth < 900; });
    host.dataset.sidebarSide = sidebarSide;
    const visible = !panel.hidden && innerWidth >= 900;
    host.toggleAttribute('data-sidebar-visible', visible);
    toolbar.style.insetInlineStart = visible && sidebarSide === 'left' ? panel.offsetWidth + 20 + 'px' : '';
    toolbar.style.insetInlineEnd = visible && sidebarSide === 'right' ? panel.offsetWidth + 20 + 'px' : '';
    const room = visible && pageLayout === 'room' && !cacheDenied ? sidebarSide : null;
    if (room !== document.documentElement.getAttribute('data-feedbackpress-room')) {
      if (room) document.documentElement.setAttribute('data-feedbackpress-room', room);
      else document.documentElement.removeAttribute('data-feedbackpress-room');
      targetEpoch++; requestAnimationFrame(() => { drawPins(); positionDraft(); });
    }
    saveView();
  }
  function captureListScroll() {
    const list = panel.querySelector('.issue-list');
    if (stylesReady && !panel.hidden && !listLoading && list?.feedbackpressPositioned && list.querySelector('.issue-row')) { listScroll = list.scrollTop; hasListPosition = true; }
  }
  function prepareListReveal() {
    const list = panel.querySelector('.issue-list');
    if (panel.hidden && list) list.feedbackpressPositioned = false;
  }
  function captureThreadScroll() {
    const thread = issuePopup.querySelector('.issue-thread');
    if (stylesReady && selected && thread && !issuePopup.hidden) threadScrolls.set(selected.id, thread.scrollTop);
    while (threadScrolls.size > 200) threadScrolls.delete(threadScrolls.keys().next().value);
  }
  function restoreThreadScroll() {
    const thread = issuePopup.querySelector('.issue-thread');
    if (stylesReady && selected && thread) thread.scrollTop = threadScrolls.get(selected.id) || 0;
  }
  function resetListScroll() {
    restoringList = false; keepListOrder = false;
    listScroll = 0; hasListPosition = true;
    const list = panel.querySelector('.issue-list'); if (list) list.scrollTop = 0;
  }
  root.append(pins, highlight, toolbar, panel, tether, draftPin, composer, issuePopup, lightbox, identity);
  root.addEventListener('scroll', event => { if (event.target.matches?.('.issue-list') && !panel.hidden && !listLoading) { captureListScroll(); saveView(); } }, { capture: true, passive: true });
  root.addEventListener('scroll', event => { if (event.target === issuePopup.querySelector('.issue-thread')) captureThreadScroll(); }, { capture: true, passive: true });
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
  function targetIssueShortcuts(id) {
    if (shortcutIssueId === id) return;
    shortcutIssueId = id;
    root.querySelectorAll('[data-status-action][aria-keyshortcuts]').forEach(control => control.removeAttribute('aria-keyshortcuts'));
    const active = id || selected?.id;
    if (!active) return;
    const controls = [...panel.querySelectorAll(`[data-issue="${active}"] [data-status-action]`), ...(selected?.id === active ? issuePopup.querySelectorAll('[data-status-action]') : [])];
    controls.forEach(control => control.setAttribute('aria-keyshortcuts', statusKeys[control.dataset.statusAction]));
  }
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    // Redraws and scrolling beneath a stationary mouse must not take control from the keyboard.
    if (lastPointer?.x === event.clientX && lastPointer?.y === event.clientY) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    const node = event.composedPath().find(value => value instanceof Element);
    const issue = node?.getRootNode() === root && node.closest('[data-issue], [data-pin-issue], .issue-popup');
    targetIssueShortcuts(issue ? issue.dataset.issue || issue.dataset.pinIssue || selected?.id : null);
  }, { capture: true, passive: true });
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
      if ([401, 403].includes(response.status) && !route.includes('/notes')) {
        issueCache.clear(); clearAttachments(true); cacheDenied = true;
        if (cacheSaveTimer !== null) clearTimeout(cacheSaveTimer); cacheSaveTimer = null;
        try { sessionStorage.removeItem(cacheKey); } catch (_) {}
        issues = []; pageIssues = []; selected = null; statusCounts = null; countedStatuses.clear(); knownIssues = null; notesRequest++; privateNotes.clear(); threadScrolls.clear();
        listLoading = false; listError = data.message || 'Feedback access changed. Refresh this page.';
        mentionData = null; closeMentionMenu();
        sidebarSettings.querySelector('.review-link-result')?.replaceChildren();
        restoringList = false; listLoaded = false; total = 0; issuePopup.hidden = true; tether.hidden = true;
        if (open) render(); drawPins();
      }
      const error = new Error(data.message || `Request failed (${response.status}). Try again.`); error.status = response.status; throw error;
    }
    if (!writes) {
      if (route.startsWith('issues') && !route.includes('/notes')) cacheResponse(await response.clone().json().catch(() => null));
      return response;
    }
    // Keep the key until the complete JSON acknowledgment arrives, including uploads.
    const data = await response.json(); pendingRequests.delete(signature);
    if (!route.includes('/notes')) cacheResponse(data);
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
    if (!value) imageDropJob = null; clearImageDrop();
    captureListScroll();
    issueRequest++; openingIssue = 0; if (!value) closeStatusFilter(); closeDraft(); cancelPick(); identity.hidden = true; notice.hidden = true; open = value;
    if (value) prepareListReveal(); panel.hidden = !value; viewButton.setAttribute('aria-expanded', String(value));
    updateChrome(); positionDraft();
    if (value) { render(); load(null, true); } else { panel.removeAttribute('data-continuing'); viewButton.focus(); }
  }
  function clearImageDrop() {
    clearTimeout(imageDropTimer);
    imageDropTarget?.classList.remove('image-drop-active', 'image-drop-blocked');
    imageDropTarget?.querySelector(':scope > .image-drop-hint')?.remove(); imageDropTarget = null;
  }
  function imageDropInfo(event) {
    if (![...(event.dataTransfer?.types || [])].includes('Files') || lightbox.open || !identity.hidden) return null;
    const surface = event.composedPath().find(node => node instanceof Element && node.matches('.issue-row, .issue-popup'));
    if (!surface || surface.hidden) return null;
    const id = surface === issuePopup ? selected?.id : surface.dataset.issue;
    const issue = issueCache.get(id)?.issue || issues.find(item => item.id === id) || (selected?.id === id ? selected : null);
    if (!issue) return null;
    const blocked = privateReply.has(id) ? 'Switch off Private note to attach shared images.' : issue.pending ? 'Wait for this issue to finish saving.' : busy ? 'Finish the current action before attaching images.' : '';
    return { surface, issue, blocked };
  }
  root.addEventListener('dragover', event => {
    const info = imageDropInfo(event);
    if (!info) { clearImageDrop(); return; }
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = info.blocked ? 'none' : 'copy';
    if (imageDropTarget !== info.surface || imageDropTarget.classList.contains('image-drop-blocked') !== Boolean(info.blocked)) {
      clearImageDrop(); imageDropTarget = info.surface;
      imageDropTarget.classList.add('image-drop-active'); imageDropTarget.classList.toggle('image-drop-blocked', Boolean(info.blocked));
      imageDropTarget.append(el('div', { class: 'image-drop-hint', role: 'status' }, icon('image'), el('strong', {}, info.blocked || (imageDropJob?.issueId === info.issue.id ? 'Add images to this reply' : 'Drop images to reply to #' + info.issue.number)), el('small', {}, info.blocked ? 'No images will be attached.' : 'Shared image reply · 5 MB per image')));
    }
    clearTimeout(imageDropTimer); imageDropTimer = setTimeout(clearImageDrop, 1200);
  });
  root.addEventListener('dragleave', event => { if (!(event.relatedTarget instanceof Node) || !imageDropTarget?.contains(event.relatedTarget)) clearImageDrop(); });
  root.addEventListener('drop', event => {
    const info = imageDropInfo(event); clearImageDrop(); if (!info) return;
    event.preventDefault(); event.stopPropagation();
    if (info.blocked) return message(info.blocked);
    const files = [...event.dataTransfer.files];
    if (!files.length || files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type.toLowerCase()) && (file.type || !/\.(png|jpe?g|webp)$/i.test(file.name)))) return message('Drop PNG, JPEG or WebP images. Use the attachment button for PDFs.');
    const invalid = files.find(file => !file.size || file.size > c.maxBytes);
    if (invalid) return message(!invalid.size ? invalid.name + ' is empty.' : invalid.name + ' exceeds 5 MB.');
    const id = info.issue.id;
    withIdentity(() => {
      if (cacheDenied || privateReply.has(id)) return;
      const current = issueCache.get(id)?.issue || info.issue;
      if (imageDropJob?.issueId === id) {
        const job = imageDropJob;
        job.files.push(...files.map(file => ({ file, key: crypto.randomUUID(), screenshot: false })));
        if (job.phase === 'done') job.phase = 'files'; delete job.error;
        sharedJobs.set(job.id, job); renderJobs();
        storeJob(job).catch(error => { job.error = error.message; renderJobs(); }); executeJob(job);
      } else imageDropJob = enqueueShared('reply', `issues/${id}/replies`, { author: name, author_email: email, body: '', mentions: [], attachment_only: true, revision: current.revision }, files);
    });
  });
  addEventListener('dragend', clearImageDrop); addEventListener('blur', clearImageDrop);
  async function loadPagePins(statusFilter) {
    const result = [];
    const params = new URLSearchParams({ path: pagePath, order: 'created_asc' });
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
    const params = new URLSearchParams({ page: String(listPage), order: sort, group: grouping });
    if (scope === 'current') params.set('path', pagePath);
    if (search.trim()) params.set('search', search.trim());
    if (typeof focus === 'string') params.set('focus', focus);
    params.set('status', filter.join(',') || 'none');
    try {
      // A sync response cannot stand in for the first filtered, paginated list read.
      const restoring = restoringList, restoreOrder = keepListOrder, retained = preserveOrder && keepListOrder && listLoaded && !restoring;
      listLoading = !retained && !restoring; listError = '';
      if (open && !draft && !issues.length) render();
      const pinRead = loadPagePins(filter).then(currentPins => {
        if (ticket !== requestNumber || cacheDenied) return;
        pageIssues = currentPins.map(optimisticIssue); for (const job of sharedJobs.values()) showPendingCreate(job); drawPins(); positionDraft();
      });
      const [data] = await Promise.all([retained ? null : (async () => (await api('issues?' + params)).json())(), pinRead]); if (ticket !== requestNumber || cacheDenied) return;
      listLoading = false;
      if (data) {
        if (restoring && restoreOrder && data.page === listPage) {
          const current = new Map(data.issues.map(issue => [issue.id, issue]));
          issues = issues.map(issue => optimisticIssue(current.get(issue.id) || issue));
        } else { issues = data.issues.map(optimisticIssue); total = data.total; listPage = data.page; keepListOrder = false; }
        if (data.status_counts) {
          statusCounts = { ...data.status_counts }; countedStatuses.clear();
          for (const { issue } of issueCache.values()) countedStatuses.set(issue.id, { status: issue.status, matches: matchesListSearch(issue) });
          for (const { issue } of issueCache.values()) updateStatusCount(optimisticIssue(issue));
        }
        listLoaded = true; restoringList = false; loadedListSignature = listSignature();
      }
      for (const job of sharedJobs.values()) showPendingCreate(job);
      saveView();
      if (open && !draft) render(); updateNavigation(); drawPins(); positionDraft();
    } catch (error) { if (ticket === requestNumber) { listLoading = false; listError = error.message; if (open) render(); if (!open || issues.length) message(error.message); } }
  }
  function statusControl(issue, place, change = null) {
    const actions = Object.entries(labels).map(([status, label]) => {
      const current = status === issue.status;
      const action = button(icon(status === 'done' ? 'check' : status), () => { if (!change) targetIssueShortcuts(issue.id); if (!current || issue.conflict) { if (change) change(status); else setStatus(issue, status, action); } }, {
        class: 'fp-icon-button status-action status-' + status + (current ? ' is-current' : ''),
        'aria-pressed': String(current), disabled: Boolean(issue.pending),
        'data-status-action': status,
        'aria-label': change ? `New issue status: ${label}` : `Set issue ${issue.number} to ${label}`,
        'aria-keyshortcuts': !change && (shortcutIssueId || selected?.id) === issue.id ? statusKeys[status] : null,
        title: current && !issue.conflict ? label + ' — current' : 'Set to ' + label,
        'data-tooltip-shortcut': change ? null : statusKeys[status],
        'data-tooltip-note': change ? null : 'Shortcuts follow your latest mouse or keyboard interaction'
      });
      return action;
    });
    return el('div', { class: 'status-controls ' + place, 'data-status': issue.status },
      el('div', { class: 'status-actions', role: 'group', 'aria-label': change ? 'New issue status' : `Change status for issue ${issue.number}` }, ...actions));
  }
  function matchesSearch(issue) {
    const text = [issue.title || '', issue.body || '', ...(issue.activity || []).map(event => event.payload?.body || '')].join(' ').toLocaleLowerCase();
    return search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term => text.includes(term));
  }
  function matchesScope(issue) { return scope === 'all' || issue.path === pagePath; }
  function matchesListSearch(issue) { return matchesScope(issue) && matchesSearch(issue); }
  function updateStatusCount(issue) {
    const before = countedStatuses.get(issue.id), matches = matchesListSearch(issue);
    if (statusCounts && before && (before.status !== issue.status || before.matches !== matches)) {
      if (before.matches) statusCounts[before.status] = Math.max(0, statusCounts[before.status] - 1);
      if (matches) statusCounts[issue.status]++;
    }
    if (statusCounts && !before && matches && [...sharedJobs.values()].some(job => job.kind === 'create' && job.issueId === issue.id)) statusCounts[issue.status]++;
    countedStatuses.set(issue.id, { status: issue.status, matches });
    paintStatusCounts();
  }
  function paintStatusCounts() {
    if (!statusCounts) return;
    panel.querySelectorAll('[data-count-status]').forEach(node => { node.textContent = statusCounts[node.dataset.countStatus]; });
    panel.querySelectorAll('[data-filter-status]').forEach(node => node.setAttribute('aria-description', `${statusCounts[node.dataset.filterStatus]} matching issues`));
  }
  function filterSummary() {
    return filter.length === Object.keys(labels).length ? 'All statuses' : filter.length === 0 ? 'No statuses' : filter.length > 2 ? `${filter.length} statuses` : filter.map(status => labels[status]).join(' + ');
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
      const input = el('input', { type: 'checkbox', checked: filter.includes(status), 'data-filter-status': status, 'aria-description': statusCounts ? `${statusCounts[status]} matching issues` : 'Count loading', onchange: event => {
        filter = Object.keys(labels).filter(value => value === status ? event.target.checked : filter.includes(value));
        listPage = 1; resetListScroll(); saveView();
        const summary = filterSummary();
        panel.querySelector('.filter-summary').textContent = summary;
        panel.querySelector('.status-filter-trigger').dataset.tooltip = summary;
        load();
      } });
      options.append(el('label', { class: 'filter-option', 'data-status': status }, input, el('span', { class: 'status-dot', 'aria-hidden': 'true' }), label, el('span', { class: 'status-count', 'data-count-status': status, 'aria-hidden': 'true' }, statusCounts ? String(statusCounts[status]) : '…')));
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
    captureListScroll();
    rowPreviewObserver?.disconnect(); rowPreviewQueue.clear();
    updateChrome();
    const searchInput = panel.querySelector('.issue-search');
    const searchSelection = root.activeElement === searchInput && searchInput ? [searchInput.selectionStart, searchInput.selectionEnd, searchInput.selectionDirection] : null;
    const focusedStatus = root.activeElement?.dataset.filterStatus;
    const focusedTrigger = root.activeElement?.classList.contains('status-filter-trigger');
    const focusedView = root.activeElement?.getAttribute('aria-label');
    const changeView = () => { listPage = 1; resetListScroll(); saveView(); load(); };
    const order = el('select', { 'aria-label': 'Order issues', 'data-tooltip': 'Order issues: ' + sortLabels[sort], onchange: event => { sort = event.target.value; changeView(); } }, ...Object.entries(sortLabels).map(([value, label]) => el('option', { value }, label))); order.value = sort;
    const orderControl = el('span', { class: 'order-control' }, icon('sort'), order);
    const heading = el('header', { class: 'panel-header' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Issues'), el('span', { class: 'issue-count', 'aria-live': 'polite' }, listLoading && !total ? 'Loading…' : `${total} ${total === 1 ? 'issue' : 'issues'}`)),
      el('div', { class: 'panel-actions' }, orderControl, button(icon('plus'), () => withIdentity(startPick), { class: 'fp-icon-button', 'aria-label': 'Leave feedback', title: 'Leave feedback', 'data-tooltip-shortcut': 'C', 'aria-keyshortcuts': 'C' }), button(icon('close'), () => toggle(false), { class: 'fp-icon-button', 'aria-label': 'Dismiss issues', 'data-tooltip-shortcut': 'V', 'aria-keyshortcuts': 'V' })));
    const searchField = el('input', { type: 'search', class: 'issue-search', 'aria-label': 'Search issues and replies', placeholder: 'Search issues and replies…', value: search, oninput: event => {
      search = event.target.value; listPage = 1; resetListScroll(); saveView(); requestNumber++;
      clearTimeout(searchTimer); searchTimer = setTimeout(() => load(), 200);
    } });
    const pages = el('select', { 'aria-label': 'Issue page view', onchange: event => { scope = event.target.value === 'current' ? 'current' : 'all'; grouping = event.target.value === 'paged' ? 'page' : 'none'; changeView(); } }, el('option', { value: 'list' }, 'All issues listed'), el('option', { value: 'paged' }, 'All issues by page'), el('option', { value: 'current' }, 'Current page')); pages.value = scope === 'current' ? 'current' : grouping === 'page' ? 'paged' : 'list';
    const list = el('div', { class: 'issue-list', 'aria-busy': String(listLoading || Boolean(openingIssue) || !stylesReady) });
    panelContents.replaceChildren(el('div', { class: 'panel-tools' }, heading, el('div', { class: 'search-field' }, icon('search'), searchField), el('div', { class: 'filters' }, pages, statusFilterControl())), list);
    if (!issues.length) {
      if (listLoading) list.append(el('div', { class: 'list-placeholder', role: 'status', 'aria-label': 'Loading issues' }, ...Array.from({ length: 3 }, () => el('div', {}, el('span'), el('span'), el('span')))));
      else if (listError) list.append(el('div', { class: 'empty', role: 'status' }, el('p', { class: 'subtle' }, listError), button('Try again', () => load(), { class: 'fp-quiet' })));
      else list.append(el('p', { class: 'empty subtle' }, search.trim() ? 'No issues match this search and status filter.' : 'No issues match this filter.'));
    }
    let path = null;
    for (const issue of issues) {
      if (grouping === 'page' && path !== issue.path) {
        path = issue.path;
        list.append(el('div', { class: 'page-heading' }, el('h3', { class: 'page-title' }, issue.page_title || 'Page'), el('a', { class: 'page-url', href: c.home + path }, c.home + path)));
      }
      list.append(issueRow(issue));
    }
    if (selected && matchesScope(selected) && !listLoading && !issues.some(issue => issue.id === selected.id)) list.append(el('small', { class: 'outside-filter' }, 'Selected issue outside this list'), issueRow(selected));
    if (total > 50) panelContents.append(el('nav', { class: 'actions pagination', 'aria-label': 'Issue pages' }, button(icon('previous'), () => { listPage--; resetListScroll(); load(); }, { class: 'fp-icon-button', 'aria-label': 'Previous list page', disabled: listPage <= 1 }), el('small', {}, `${listPage} / ${Math.ceil(total / 50)}`), button(icon('next'), () => { listPage++; resetListScroll(); load(); }, { class: 'fp-icon-button', 'aria-label': 'Next list page', disabled: listPage * 50 >= total })));
    // Hidden/mobile and loading lists have no usable scroll range; retain the saved position until visible.
    if (stylesReady && !panel.hidden && issues.length) {
      list.scrollTop = listScroll;
      list.feedbackpressPositioned = true;
      if (!listLoading) { listScroll = list.scrollTop; hasListPosition = true; saveView(); }
    }
    if (filterOpen && focusedStatus) panel.querySelector(`[data-filter-status="${focusedStatus}"]`)?.focus();
    else if (focusedTrigger) panel.querySelector('.status-filter-trigger')?.focus();
    else if (['Issue page view', 'Order issues'].includes(focusedView)) panel.querySelector(`[aria-label="${focusedView}"]`)?.focus({ preventScroll: true });
    else if (searchSelection) { searchField.focus({ preventScroll: true }); searchField.setSelectionRange(...searchSelection); }
  }
  function pageLabel(path) { return path === '/' ? c.home.replace(/\/$/, '') + '/' : path; }
  function issueRow(issue) {
    const active = selected?.id === issue.id;
    return el('div', { class: 'issue-row' + (active ? ' is-selected' : ''), 'data-issue': issue.id, 'data-status': issue.status },
      el('button', { type: 'button', class: 'issue-open', 'aria-current': active ? 'true' : null, onclick: () => showIssue(issue.id) }, el('span', { class: 'row-heading' }, el('span', { class: 'row-number' }, '#' + issue.number), el('span', { class: 'row-author' }, issue.author)), el('span', { class: 'issue-body' }, issue.title || issue.body), grouping !== 'page' ? el('small', { class: 'page-reference' }, pageLabel(issue.path)) : null, issueSummary(issue)), statusControl(issue, 'row-status'));
  }
  function issueSummary(issue) {
    const replies = issue.activity.filter(event => event.kind === 'reply').length;
    const files = issue.files.filter(file => !file.screenshot);
    if (!replies && !files.length) return null;
    const summary = el('span', { class: 'row-summary' });
    if (replies) summary.append(el('span', { class: 'row-replies' }, icon('reply'), `${replies} ${replies === 1 ? 'reply' : 'replies'}`));
    if (files.length) summary.append(el('span', { class: 'row-attachments', role: 'img', 'aria-label': `${files.length} ${files.length === 1 ? 'attachment' : 'attachments'}` }, ...files.slice(0, 3).map(rowAttachment), files.length > 3 ? el('span', { class: 'row-attachment-more', 'aria-hidden': 'true' }, '+' + (files.length - 3)) : null));
    return summary;
  }
  function rowAttachment(file) {
    const tile = el('span', { class: 'row-attachment', 'aria-hidden': 'true', 'data-tooltip': (file.expired ? 'Expired: ' : !file.available ? 'Not yet available: ' : '') + file.name }, icon(file.mime.startsWith('image/') ? 'image' : 'document'));
    if (file.available && file.mime.startsWith('image/')) {
      tile.feedbackpressFile = file;
      rowPreviewObserver ||= new IntersectionObserver(entries => {
        for (const entry of entries) { if (entry.isIntersecting) rowPreviewQueue.add(entry.target); else rowPreviewQueue.delete(entry.target); }
        loadRowPreviews();
      });
      rowPreviewObserver.observe(tile);
    }
    return tile;
  }
  function loadRowPreviews() {
    // Original images can be 5 MB: only visible tiles, two transfers at a time.
    while (rowPreviewActive < 2 && rowPreviewQueue.size) {
      const tile = rowPreviewQueue.values().next().value; rowPreviewQueue.delete(tile); rowPreviewObserver.unobserve(tile);
      if (!tile.isConnected || cacheDenied) continue;
      rowPreviewActive++;
      const file = tile.feedbackpressFile;
      attachmentData(file).then(data => { if (tile.isConnected) tile.replaceChildren(el('img', { src: data.url, alt: '', decoding: 'async' })); })
        .catch(() => { if (tile.isConnected) tile.dataset.tooltip = 'Preview unavailable: ' + file.name; })
        .finally(() => { rowPreviewActive--; loadRowPreviews(); });
    }
  }
  function compareIssues(a, b) {
    if (grouping === 'page' && a.path !== b.path) return a.path.localeCompare(b.path, 'en', { numeric: true });
    const [field, direction] = sort.split('_'), left = a[field + '_at'] || '', right = b[field + '_at'] || '', sign = direction === 'desc' ? -1 : 1;
    if (!left || !right) return Number(!left) - Number(!right) || Number(a.number) - Number(b.number);
    return left.localeCompare(right) * sign || (Number(a.number) - Number(b.number)) * (field === 'created' ? sign : 1);
  }
  function navigationIssues() {
    if (!selected || !matchesScope(selected) || issues.some(issue => issue.id === selected.id)) return issues;
    return [...issues, selected].sort(compareIssues);
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
  function closeIssue() { imageDropJob = null; clearImageDrop(); captureThreadScroll(); clearAttachments(); selected = null; targetIssueShortcuts(null); issuePopup.hidden = true; tether.hidden = true; if (open) { prepareListReveal(); panel.hidden = false; } render(); drawPins(); }
  async function stepIssue(direction) {
    if (busy || steppingPage) return;
    const items = navigationIssues();
    const index = items.findIndex(issue => issue.id === selected?.id);
    const next = index < 0 ? (direction > 0 ? 0 : items.length - 1) : index + direction;
    if ((next < 0 && listPage > 1) || (next >= items.length && listPage * 50 < total)) {
      const backward = next < 0; steppingPage = true; listPage += backward ? -1 : 1;
      try { await load(); } finally { steppingPage = false; }
      if (issues.length) await showIssue((backward ? issues.at(-1) : issues[0]).id);
    }
    else if (items[next]) await showIssue(items[next].id);
  }
  async function showIssue(id, scroll = true) {
    if (imageDropJob?.issueId !== id) imageDropJob = null;
    clearImageDrop();
    if (scroll) { closeStatusFilter(); targetIssueShortcuts(id); }
    captureListScroll(); captureThreadScroll(); const keepPosition = hasListPosition;
    const ticket = ++issueRequest; openingIssue = ticket;
    const cached = issueCache.get(id)?.issue || issues.find(issue => issue.id === id) || pageIssues.find(issue => issue.id === id);
    const display = issue => {
      if (ticket !== issueRequest || cacheDenied) return false;
      if (issue.path !== pagePath) { captureListScroll(); saveView(); location.assign(c.home + issue.path + '#feedbackpress=' + issue.id); return false; }
      closeDraft(); cancelPick(); privateNotes.delete(issue.id); selected = issue;
      issues = issues.map(existing => existing.id === issue.id ? issue : existing);
      if (scroll) open = true;
      panel.hidden = !open || innerWidth < 900; viewButton.setAttribute('aria-expanded', String(open)); render(); renderIssue(); loadNotes(issue.id);
      if (scroll && issue.target.selector) locate(issue);
      positionDraft();
      if (scroll && !keepPosition && !panel.hidden) { panel.querySelector(`[data-issue="${issue.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); captureListScroll(); saveView(); }
      return true;
    };
    if (cached && !display(cached)) { openingIssue = 0; return; }
    try {
      if (cached?.pending) return;
      const issue = await readIssue(id);
      if (ticket !== issueRequest) return;
      if (!cached) display(issue);
      else {
        const known = issueCache.get(id)?.issue;
        if (!known || !(Number(known.revision) > Number(issue.revision))) applyIssue(issue);
      }
    } catch (error) { if (ticket === issueRequest) message(error.message); }
    finally { if (openingIssue === ticket) { openingIssue = 0; panel.querySelector('.issue-list')?.setAttribute('aria-busy', String(listLoading || !stylesReady)); } }
  }
  function closeLightbox() {
    viewerRequest++; previewFileId = null;
    if (lightbox.open) lightbox.close();
    lightbox.replaceChildren();
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function releaseAttachment(entry, immediate = false) {
    if (!entry.url) return;
    const pending = immediate ? [] : [...root.querySelectorAll('img')].filter(image => image.src === entry.url && !image.complete);
    if (!pending.length) { URL.revokeObjectURL(entry.url); return; }
    let remaining = pending.length;
    for (const image of pending) {
      const loaded = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', loaded); if (!--remaining) URL.revokeObjectURL(entry.url); };
      image.addEventListener('load', loaded, { once: true }); image.addEventListener('error', loaded, { once: true });
    }
  }
  function pruneAttachments(protectedId = null, all = false) {
    let bytes = [...attachmentCache.values()].reduce((total, entry) => total + (entry.url ? entry.size : 0), 0);
    let count = [...attachmentCache.values()].filter(entry => entry.url).length;
    for (const [id, entry] of attachmentCache) {
      if (!all && (!entry.url || id === protectedId || id === previewFileId)) continue;
      if (!all && Date.now() - entry.at < cacheLifetime && bytes <= 20 * 1024 * 1024 && count <= 8) continue;
      releaseAttachment(entry, all); attachmentCache.delete(id);
      if (entry.url) { bytes -= entry.size; count--; }
    }
  }
  function clearAttachments(all = false) {
    closeLightbox(); previewIssueId = null; pruneAttachments(null, all);
  }
  function attachmentData(file) {
    const cached = attachmentCache.get(file.id);
    if (cached && (Date.now() - cached.at < cacheLifetime || file.id === previewFileId)) return cached.promise;
    if (cached?.url) URL.revokeObjectURL(cached.url);
    attachmentCache.delete(file.id);
    const entry = { url: null, promise: null, at: Date.now(), size: file.size || 0 };
    entry.promise = (async () => {
      const blob = await (await api('files/' + file.id)).blob();
      if (attachmentCache.get(file.id) !== entry) throw new Error('Preview cancelled.');
      entry.url = URL.createObjectURL(blob); entry.size = blob.size; pruneAttachments(file.id);
      return { url: entry.url, blob };
    })().catch(error => { if (attachmentCache.get(file.id) === entry) attachmentCache.delete(file.id); throw error; });
    attachmentCache.set(file.id, entry);
    return entry.promise;
  }
  function downloadAttachment(file, url) {
    const link = el('a', { href: url, download: file.name }); root.append(link); link.click(); link.remove();
  }
  async function openAttachment(file, trigger) {
    closeMentionMenu();
    const ticket = ++viewerRequest; returnFocus = trigger; previewFileId = file.id;
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
  addEventListener('pagehide', () => { captureListScroll(); captureThreadScroll(); saveView(); if (cacheSaveTimer !== null) clearTimeout(cacheSaveTimer); persistIssueCache(true); clearAttachments(true); });
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
    mentionDrafts.delete('edit:' + comment.id);
    editDrafts.set(comment.id, { issue: selected.id, body: comment.body, mentions: comment.mentions || [], title: comment.title || '', revision: comment.edit_revision });
    renderIssue(); issuePopup.querySelector(`[data-edit-comment="${comment.id}"] textarea`)?.focus();
  }
  async function loadMentionPeople() {
    if (mentionData && Date.now() - mentionAt < cacheLifetime) return mentionData;
    if (!mentionRead) mentionRead = api('mentions').then(r => r.json()).then(data => {
      if (cacheDenied) throw Error('Mention names unavailable.');
      data.people.sort((a, b) => a.name.localeCompare(b.name)); mentionData = data; mentionAt = Date.now(); return data;
    }).finally(() => { mentionRead = null; });
    return mentionRead;
  }
  function closeMentionMenu() {
    if (mentionActive) { mentionActive.field.removeAttribute('aria-activedescendant'); mentionActive.field.removeAttribute('aria-controls'); }
    mentionActive = null;
    if (mentionPicker) { if (mentionPicker.hidePopover && mentionPicker.matches(':popover-open')) mentionPicker.hidePopover(); mentionPicker.hidden = true; }
  }
  function positionMentionMenu() {
    if (!mentionActive || !mentionPicker || mentionPicker.hidden) return;
    const box = mentionActive.field.getBoundingClientRect(), viewport = visualViewport, top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || innerHeight), width = Math.min(box.width, 320, innerWidth - 24);
    const height = Math.min(220, Math.max(bottom - box.bottom - 12, box.top - top - 12));
    Object.assign(mentionPicker.style, { width: width + 'px', maxHeight: height + 'px', left: Math.max(8, Math.min(box.left, innerWidth - width - 8)) + 'px', top: (bottom - box.bottom >= Math.min(180, height) ? box.bottom + 4 : Math.max(top + 8, box.top - mentionPicker.offsetHeight - 4)) + 'px' });
  }
  function chooseMention(person) {
    const active = mentionActive; if (!active) return;
    const { field, state, start, end } = active, label = '@' + person.name;
    field.setRangeText(label + ' ', start, end, 'end'); field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    state.ranges.push({ id: person.id, start, end: start + label.length }); state.ranges.sort((a, b) => a.start - b.start);
    mentionDrafts.set(state.key, { text: field.value, ranges: state.ranges }); closeMentionMenu(); field.focus();
  }
  function paintMentionMenu() {
    const active = mentionActive; if (!active || !active.field.isConnected || !active.enabled()) return closeMentionMenu();
    if (!mentionPicker) {
      mentionList = el('div', { id: 'fp-mention-options', role: 'listbox', 'aria-label': 'Mention someone' });
      mentionPicker = el('div', { class: 'mention-picker', popover: 'manual', hidden: true }, mentionList); root.append(mentionPicker);
      mentionPicker.addEventListener('pointerdown', event => event.preventDefault());
    }
    active.options = (mentionData?.people || []).filter(p => p.id !== actorId && p.name.toLocaleLowerCase().includes(active.query.toLocaleLowerCase())).slice(0, 8);
    if (active.index >= active.options.length) active.index = 0;
    mentionList.replaceChildren(...active.options.map((person, index) => el('div', { id: 'fp-mention-' + person.id, role: 'option', 'aria-selected': String(index === active.index), class: index === active.index ? 'is-active' : '', onpointermove: () => { if (active.index !== index) { active.index = index; paintMentionMenu(); } }, onclick: () => chooseMention(person) }, person.name)));
    const status = active.error ? 'Names unavailable. Try @ again.' : !mentionData ? 'Loading people…' : !active.options.length ? 'No matching people have commented yet.' : !mentionData.review_site ? 'Mentions stay in the thread; email needs a public project site.' : mentionData.delivery === 'capture' ? 'Email preview only; live delivery is off.' : mentionData.delivery === 'disabled' ? 'Mention emails are off for this project.' : 'Email notifications respect each person’s preferences.';
    mentionPicker.querySelector('.mention-help')?.remove(); mentionPicker.append(el('p', { class: 'mention-help', role: 'status' }, status));
    active.field.setAttribute('aria-controls', mentionList.id);
    if (active.options[active.index]) active.field.setAttribute('aria-activedescendant', 'fp-mention-' + active.options[active.index].id);
    else active.field.removeAttribute('aria-activedescendant');
    mentionPicker.hidden = false; if (mentionPicker.showPopover && !mentionPicker.matches(':popover-open')) mentionPicker.showPopover(); positionMentionMenu();
  }
  function mentionField(field, key, ranges = [], enabled = () => true) {
    const saved = mentionDrafts.get(key), state = { key, text: field.value, ranges: saved?.text === field.value ? saved.ranges.map(m => ({ ...m })) : ranges.map(m => ({ ...m })) };
    field.feedbackpressMentionState = state;
    field.feedbackpressMentionEnabled = () => { for (const [name, value] of [['aria-autocomplete', 'list'], ['aria-haspopup', 'listbox'], ['aria-description', 'Type @ to mention someone who has commented on this project.']]) { if (enabled()) field.setAttribute(name, value); else field.removeAttribute(name); } };
    field.feedbackpressMentionEnabled();
    const update = event => {
      const next = field.value, old = state.text; let prefix = 0, suffix = 0;
      while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
      while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
      const end = old.length - suffix, delta = next.length - old.length;
      state.ranges = state.ranges.flatMap(m => m.end <= prefix ? [m] : m.start >= end ? [{ ...m, start: m.start + delta, end: m.end + delta }] : []).filter(m => !/[\p{L}\p{N}_]/u.test(next[m.end] || ''));
      state.text = next; mentionDrafts.set(key, { text: next, ranges: state.ranges });
      if (!enabled() || event?.isComposing || field.selectionStart !== field.selectionEnd) return closeMentionMenu();
      const before = next.slice(0, field.selectionStart), match = before.match(/(?:^|[\s(])@([^@\n]{0,60})$/);
      if (!match || state.ranges.length >= 20) return closeMentionMenu();
      if (state.ranges.some(m => m.start === before.length - match[1].length - 1)) return closeMentionMenu();
      if (mentionActive?.field !== field) closeMentionMenu();
      mentionActive = { field, state, enabled, start: before.length - match[1].length - 1, end: before.length, query: match[1], index: 0, options: [] };
      paintMentionMenu(); const active = mentionActive;
      loadMentionPeople().then(() => { if (mentionActive === active) paintMentionMenu(); }).catch(() => { if (mentionActive === active) { active.error = true; paintMentionMenu(); } });
    };
    field.addEventListener('input', update); field.addEventListener('click', update); field.addEventListener('compositionend', update);
    field.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) update(event); });
    field.addEventListener('select', () => { if (field.selectionStart !== field.selectionEnd) closeMentionMenu(); });
    field.addEventListener('focus', () => { field.feedbackpressMentionEnabled(); if (enabled()) loadMentionPeople().catch(() => {}); });
    field.addEventListener('blur', () => { setTimeout(() => { if (mentionActive?.field === field && root.activeElement !== field) closeMentionMenu(); }, 0); });
    return field;
  }
  function readMentionField(field) {
    const raw = field.value, start = raw.length - raw.trimStart().length, body = raw.trim();
    return { body, mentions: (field.feedbackpressMentionState?.ranges || []).filter(m => m.start >= start && m.end <= start + body.length).map(m => ({ id: m.id, start: m.start - start, end: m.end - start })) };
  }
  function restoreMentionField(field, body, ranges) {
    field.value = body; const state = field.feedbackpressMentionState;
    if (state) { state.text = body; state.ranges = (ranges || []).map(m => ({ ...m })); mentionDrafts.set(state.key, { text: body, ranges: state.ranges }); }
  }
  function mentionKey(event) {
    const active = mentionActive;
    if (!active || !event.composedPath().includes(active.field) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
    if (event.key === 'Escape') closeMentionMenu();
    else if (['ArrowDown', 'ArrowUp'].includes(event.key) && active.options.length) { active.index = (active.index + (event.key === 'ArrowDown' ? 1 : -1) + active.options.length) % active.options.length; paintMentionMenu(); mentionList.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }
    else if (['Enter', 'Tab'].includes(event.key) && active.options[active.index]) chooseMention(active.options[active.index]);
    else return false;
    event.preventDefault(); event.stopImmediatePropagation(); return true;
  }
  function mentionText(comment) {
    const nodes = []; let at = 0;
    for (const m of comment.mentions || []) { if (m.start < at || m.end > comment.body.length) continue; nodes.push(comment.body.slice(at, m.start), el('span', { class: 'comment-mention' }, comment.body.slice(m.start, m.end))); at = m.end; }
    nodes.push(comment.body.slice(at)); return nodes;
  }
  document.addEventListener('pointerdown', event => { if (mentionActive && !event.composedPath().includes(mentionActive.field) && !event.composedPath().includes(mentionPicker)) closeMentionMenu(); }, true);
  root.addEventListener('scroll', event => { if (!mentionPicker?.contains(event.target)) closeMentionMenu(); }, true);
  addEventListener('resize', () => requestAnimationFrame(positionMentionMenu));
  addEventListener('scroll', closeMentionMenu, { passive: true });
  window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(positionMentionMenu));
  function commentEditor(comment, draft) {
    const form = el('form', { class: 'comment-editor', 'data-edit-comment': comment.id, onsubmit: event => {
      event.preventDefault();
      editDrafts.delete(comment.id);
      const content = readMentionField(form.querySelector('textarea')); mentionDrafts.delete('edit:' + comment.id);
      enqueueShared('edit', `issues/${draft.issue}/comments/${comment.id}`, { author: name, author_email: email, ...content, ...(comment.id === draft.issue ? { title: draft.title } : {}), revision: draft.revision }, [], null, draft.requestId || crypto.randomUUID());
      if (selected?.id === draft.issue) renderIssue();
    } });
    if (draft.stale) form.append(el('p', { class: 'warning' }, 'A newer edit exists. Your draft is kept below.'), button('Discard draft and reload', () => perform(form, async () => { const current = await (await api('issues/' + draft.issue)).json(); if (selected?.id !== draft.issue) return; selected = current; notice.hidden = true; const latest = comment.id === current.id ? current : current.activity.find(event => event.id === comment.id)?.payload; if (latest && latest.author_id === actorId) editComment({ ...latest, id: comment.id }); else { editDrafts.delete(comment.id); renderIssue(); } }), { class: 'fp-quiet' }));
    if (comment.id === draft.issue) form.append(el('input', { value: draft.title, required: true, maxlength: 120, 'aria-label': 'Edit issue title', oninput: event => { draft.title = event.target.value; } }));
    form.append(mentionField(el('textarea', { rows: 3, required: comment.id !== draft.issue && comment.body !== '' && !selected.files.some(file => file.comment_id === comment.id && !file.screenshot), maxlength: 10000, 'aria-label': 'Edit comment', 'aria-keyshortcuts': 'Meta+Enter Control+Enter', oninput: event => { draft.body = event.target.value; } }, draft.body), 'edit:' + comment.id, draft.mentions), el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'fp-primary', disabled: !!draft.stale, title: 'Save comment', 'data-tooltip-shortcut': submitShortcut }, 'Save'), button('Cancel', () => { editDrafts.delete(comment.id); mentionDrafts.delete('edit:' + comment.id); notice.hidden = true; renderIssue(); }, { class: 'fp-quiet' })));
    return form;
  }
  function commentView(comment, files) {
    const author = comment.id === selected?.id && !comment.pending ? button(comment.author || 'Unknown author', event => editAuthor(event.currentTarget, comment), { class: 'comment-author author-edit', 'aria-label': 'Change author: ' + comment.author, title: 'Change author' }) : el('strong', { class: 'comment-author' }, comment.author || 'Unknown author');
    const byline = el('div', { class: 'comment-byline' }, author);
    const date = new Date(comment.created_at);
    if (!Number.isNaN(date.valueOf())) byline.append(el('time', { class: 'comment-date', datetime: comment.created_at, title: date.toLocaleString() }, date.toLocaleDateString()));
    if (comment.pending || comment.pending_edit) byline.append(el('span', { class: 'comment-date' }, 'Saving…'));
    if (comment.edited_at) byline.append(el('time', { class: 'comment-edited', datetime: comment.edited_at, title: 'Edited ' + new Date(comment.edited_at).toLocaleString() }, 'Edited'));
    if (!comment.pending && actorId && actorId === comment.author_id) byline.append(button('Edit', () => editComment(comment), { class: 'comment-edit', 'aria-label': comment.id === selected?.id ? 'Edit issue' : 'Edit reply' }));
    const uploads = files.filter(file => !file.screenshot);
    const screenshots = files.filter(file => file.screenshot);
    const draft = editDrafts.get(comment.id);
    const copy = el('div', { class: 'comment-copy' }, byline, comment.edit_conflict ? el('p', { class: 'warning' }, 'This comment has competing edits. Edit and save to resolve them.') : null, ...(draft ? [commentEditor(comment, draft)] : [comment.id === selected?.id && comment.title && !comment.title_generated ? el('h3', { class: 'issue-title' }, comment.title) : null, el('p', { class: 'comment' }, ...mentionText(comment))]));
    if (uploads.length) copy.append(el('div', { class: 'attachment-strip comment-uploads', role: 'group', 'aria-label': 'Comment attachments' }, ...uploads.map(attachmentThumbnail)));
    return el('div', { class: 'thread-comment' + (screenshots.length ? ' has-screenshot' : ''), 'data-comment': comment.id }, copy,
      screenshots.length ? el('div', { class: 'attachment-strip comment-screenshots', role: 'group', 'aria-label': 'Automatic screenshots' }, ...screenshots.map(attachmentThumbnail)) : null);
  }
  async function loadNotes(id) {
    if (!c.privateNotes) return;
    const request = ++notesRequest;
    try {
      const data = await (await api(`issues/${id}/notes`)).json();
      if (request !== notesRequest || !c.privateNotes) return;
      privateNotes.set(id, data.notes);
      // Refresh private content even while typing, without replacing the reply form.
      if (selected?.id === id && !issuePopup.hidden) {
        issuePopup.querySelectorAll('.private-note').forEach(node => node.remove());
        issuePopup.querySelector('.issue-thread')?.append(...data.notes.map(privateNoteView));
      }
    } catch (error) {
      if (request !== notesRequest) return;
      privateNotes.delete(id);
      if (error.status === 403) { c.privateNotes = false; privateNotes.clear(); }
      // Keep private drafts private after access loss; never turn them into shared replies.
      if (selected?.id === id) issuePopup.querySelectorAll('.private-note').forEach(node => node.remove());
    }
  }
  function privateNoteView(note) {
    const byline = el('div', { class: 'comment-byline' }, el('strong', { class: 'comment-author' }, note.author_kind === 'agent' ? note.agent + ' for ' + note.author_name : note.author_name), el('span', { class: 'private-label' }, note.author_kind === 'agent' ? 'Private agent note' : 'Private note'));
    if (note.author_kind === 'agent') byline.append(button('Convert to shared note', event => perform(event.currentTarget.closest('.private-note'), async () => {
      const id = selected.id;
      const converted = await (await api(`issues/${id}/notes/${note.id}/convert`, { method: 'POST', body: { revision: note.revision, publish: true } })).json();
      if (converted.visibility !== 'shared' || !converted.issue) throw new Error('The service needs the shared-conversion update. This note remains private.');
      applyIssue(converted.issue);
      await loadNotes(id); message('Converted to your shared note. All project reviewers can now read it.'); setTimeout(() => { if (selected && !issuePopup.hidden) renderIssue(); }, 0);
    }), { class: 'comment-edit', title: 'Publish this note to all project reviewers under your name' }));
    return el('div', { class: 'thread-comment private-note' }, el('div', { class: 'comment-copy' }, byline, el('p', { class: 'comment' }, note.body)));
  }
  function renderIssue() {
    closeMentionMenu();
    const issue = selected; const threadScroll = stylesReady && previewIssueId === issue.id ? issuePopup.querySelector('.issue-thread')?.scrollTop || 0 : threadScrolls.get(issue.id) || 0; issuePopup.dataset.status = issue.status;
    threadScrolls.set(issue.id, threadScroll);
    if (previewIssueId !== issue.id) { clearAttachments(); previewIssueId = issue.id; }
    const items = navigationIssues();
    const index = items.findIndex(item => item.id === issue.id);
    issuePopup.replaceChildren(el('header', { class: 'popup-header' }, el('strong', {}, '#' + issue.number), statusControl(issue, 'popup-status'), el('div', { class: 'popup-navigation' },
      button(icon('previous'), () => stepIssue(-1), { class: 'fp-icon-button', 'aria-label': 'Previous issue', title: 'Previous issue', 'data-tooltip-shortcut': 'P / ↑', 'aria-keyshortcuts': 'P ArrowUp', disabled: index <= 0 && listPage <= 1 }),
      button(icon('next'), () => stepIssue(1), { class: 'fp-icon-button', 'aria-label': 'Next issue', title: 'Next issue', 'data-tooltip-shortcut': 'N / ↓', 'aria-keyshortcuts': 'N ArrowDown', disabled: index >= items.length - 1 && listPage * 50 >= total }),
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
    const reply = el('textarea', { name: 'body', rows: 2, maxlength: 10000, required: true, placeholder: 'Reply or attach images…', 'aria-label': 'Reply', 'aria-keyshortcuts': 'Meta+Enter Control+Enter', oninput: event => replyDrafts.set(issue.id, event.target.value) }); reply.value = replyDrafts.get(issue.id) || '';
    const files = replyFiles.get(issue.id) || []; replyFiles.set(issue.id, files);
    const queued = el('div', { class: 'attached-files reply-queued', 'aria-live': 'polite' });
    function renderQueued() {
      reply.required = privateReply.has(issue.id) || !files.length;
      queued.replaceChildren(...files.map((file, index) => el('div', { class: 'attached-file' }, el('small', {}, file.name), button(icon('close'), () => {
        files.splice(index, 1);
        renderQueued();
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
    const privateToggle = c.privateNotes ? el('label', { class: 'private-reply-toggle' }, el('input', { type: 'checkbox', checked: privateReply.has(issue.id), onchange: event => { closeMentionMenu(); if (event.target.checked) privateReply.add(issue.id); else privateReply.delete(issue.id); input.disabled = event.target.checked; reply.required = event.target.checked || !files.length; reply.feedbackpressMentionEnabled?.(); reply.placeholder = event.target.checked ? 'Private note, visible only to your WordPress email…' : 'Reply…'; } }), 'Private note') : null;
    input.disabled = privateReply.has(issue.id); reply.placeholder = privateReply.has(issue.id) ? 'Private note, visible only to your WordPress email…' : reply.placeholder;
    issuePopup.append(el('form', { class: 'reply-form', onsubmit: event => {
      if (!privateReply.has(issue.id)) return submitReply(event, issue.id);
      event.preventDefault(); if (files.length) { message('Remove queued attachments before leaving a private note.'); return; }
      const body = reply.value, key = crypto.randomUUID(); imageDropJob = null;
      replyDrafts.delete(issue.id); mentionDrafts.delete('reply:' + issue.id); reply.value = '';
      privateWork('private note', async () => {
        await api(`issues/${issue.id}/notes`, { method: 'POST', requestId: key, body: { body, kind: 'human' } });
        await loadNotes(issue.id);
      });
    } }, mentionField(reply, 'reply:' + issue.id, [], () => !privateReply.has(issue.id)), input, queued, el('div', { class: 'reply-actions' }, button(icon('attach'), () => input.click(), { class: 'fp-icon-button', 'aria-label': 'Attach files to reply', title: 'Attach images or PDFs to this reply' }), privateToggle, el('button', { type: 'submit', class: 'fp-primary', title: 'Send reply', 'data-tooltip-shortcut': submitShortcut }, 'Reply'))));
    issuePopup.hidden = false; positionDraft(); restoreThreadScroll();
  }
  const pendingForms = new WeakSet();
  async function perform(form, work) {
    if (pendingForms.has(form)) return false;
    const session = uiSession; pendingForms.add(form); form.setAttribute('aria-busy', 'true');
    const controls = form.matches('button') ? [form] : [...form.querySelectorAll('[type=submit]')];
    controls.forEach(control => { control.disabled = true; });
    try { await work(); return true; } catch (error) { if (session === uiSession) message(error.message); return false; }
    finally { pendingForms.delete(form); form.removeAttribute('aria-busy'); controls.forEach(control => { control.disabled = false; }); }
  }
  function setStatus(issue, status) {
    if (selected?.id === issue.id) issue = selected;
    if (issue.pending) return;
    enqueueShared('status', `issues/${issue.id}/status`, { author: name, status, revision: issue.revision });
  }
  function submitReply(event, id) {
    event.preventDefault(); const form = event.target;
    const current = issueCache.get(id)?.issue || selected;
    if (!current || current.pending) return;
    const content = readMentionField(form.elements.body), files = [...(replyFiles.get(id) || [])];
    if (!content.body && !files.length) return;
    imageDropJob = null;
    replyDrafts.delete(id); mentionDrafts.delete('reply:' + id); replyFiles.delete(id); form.elements.body.value = '';
    const key = replyOperations.get(id)?.key || crypto.randomUUID(); replyOperations.delete(id);
    enqueueShared('reply', `issues/${id}/replies`, { author: name, author_email: email, ...content, attachment_only: !content.body && files.length > 0, revision: current.revision }, files, null, key);
    if (selected?.id === id) renderIssue();
  }
  async function upload(id, file, capture = false, comment = null, requestId = null) {
    if (file.size > c.maxBytes) throw new Error(`${file.name} exceeds 5 MB.`);
    const data = new FormData(); data.append('file', file); data.append('screenshot', capture ? '1' : '0');
    if (comment) data.append('comment_id', comment);
    await api(`issues/${id}/files`, { method: 'POST', body: data, ...(requestId ? { requestId } : {}) });
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
        mentionField(el('textarea', { id: 'fp-comment', name: 'body', rows: 3, maxlength: 10000, placeholder: 'Description (optional)…', 'aria-keyshortcuts': 'Meta+Enter Control+Enter' }), 'draft:' + draftOperation),
        button(icon('attach'), () => input.click(), { class: 'fp-icon-button attachment-button', 'aria-label': 'Attach files', title: 'Attach images or PDFs (5 MB each)' })),
      input, attached,
      el('div', { class: 'composer-footer' }, el('button', { type: 'submit', class: 'fp-primary', title: 'Submit feedback', 'data-tooltip-shortcut': submitShortcut, 'aria-keyshortcuts': 'Meta+Enter Control+Enter' }, 'Submit feedback')));
    form.feedbackpressFiles = files;
    composer.replaceChildren(el('div', { class: 'composer-top' }, statusPicker, button(icon('close'), () => { if (!busy) startPick(); }, { class: 'fp-icon-button', 'aria-label': 'Close feedback', title: 'Discard this pin' })), form);
    composer.hidden = false; draftPin.hidden = !draft.selector; positionDraft(); form.elements.title.focus();
  }
  function closeDraft() { closeMentionMenu(); mentionDrafts.delete(composer.querySelector('[name=body]')?.feedbackpressMentionState?.key); draft = null; screenshot = null; composer.hidden = true; draftPin.hidden = true; tether.hidden = true; drawPins(); }
  function newDraft(target) {
    if (busy) return;
    imageDropJob = null; clearImageDrop();
    cancelPick(); clearAttachments(); selected = null; issuePopup.hidden = true; draft = target; draftOperation = crypto.randomUUID(); panel.hidden = !open || innerWidth < 900; updateChrome(); viewButton.setAttribute('aria-expanded', String(open));
    notice.hidden = true; drawPins(); screenshot = capture(target); renderDraft();
  }
  function positionDraft() {
    const surface = draft ? composer : selected && !issuePopup.hidden ? issuePopup : null;
    const anchor = draft || selected?.target;
    if (!surface || !anchor || surface.hidden) return;
    const viewport = window.visualViewport;
    const viewportLeft = (viewport?.offsetLeft || 0) + 12, top = (viewport?.offsetTop || 0) + 12;
    const alongside = !panel.hidden && innerWidth >= 900, panelRect = panel.getBoundingClientRect();
    const left = alongside && sidebarSide === 'left' ? Math.max(viewportLeft, panelRect.right + 12) : viewportLeft;
    const viewportRight = viewportLeft + (viewport?.width || innerWidth) - 24;
    const right = alongside && sidebarSide === 'right' ? Math.min(viewportRight, panelRect.left - 12) : viewportRight;
    const bottom = Math.min(top + (viewport?.height || innerHeight) - 24, (!notice.hidden || !launchers.hidden) ? toolbar.getBoundingClientRect().top - 12 : Infinity);
    surface.style.maxHeight = Math.max(120, Math.min(surface === issuePopup ? 620 : Infinity, bottom - top)) + 'px';
    const point = targetPoint({ target: anchor });
    const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
    const x = clamp(point ? point.x : (left + right) / 2, left, right);
    const y = clamp(point ? point.y : top + 70, top, bottom);
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
    positionMentionMenu();
  }
  function submitDraft(e) {
    e.preventDefault(); const form = e.target, data = new FormData(form), files = [...form.feedbackpressFiles];
    if (files.some(file => file.size > c.maxBytes)) return message('Each attachment must be 5 MB or smaller.');
    const target = draft, capturePromise = screenshot;
    enqueueShared('create', 'issues', { author: name, author_email: email, title: data.get('title'), status: data.get('status'), ...readMentionField(form.elements.body), path: pagePath, target }, files, capturePromise, draftOperation);
    closeDraft(); picking = true; drawPins();
    message('Click to drop another pin. Press C or Escape to exit.');
  }
  async function capture(target) {
    try {
      const width = innerWidth, height = innerHeight;
      const point = targetPoint({ target });
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
  function selector(node, useIds = true) {
    const parts = [];
    while (node && node !== document.body && parts.length < 12) {
      if (useIds && node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      if (node.matches('main,header,footer') && document.querySelectorAll(node.tagName).length === 1) { parts.unshift(node.tagName.toLowerCase()); break; }
      if (node.classList.contains('wp-site-blocks') && document.querySelectorAll('.wp-site-blocks').length === 1) { parts.unshift('.wp-site-blocks'); break; }
      const siblings = [...node.parentElement.children].filter(n => n.tagName === node.tagName);
      parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : '')); node = node.parentElement;
    }
    return parts.join(' > ') || 'body';
  }
  function startPick() { if (busy) return; captureListScroll(); closeStatusFilter(); issueRequest++; openingIssue = 0; clearAttachments(); selected = null; issuePopup.hidden = true; closeDraft(); identity.hidden = true; picking = true; panel.hidden = !open || innerWidth < 900; updateChrome(); drawPins(); message('Click an element, or press P for page feedback. C exits placement; Escape closes review.'); }
  function stopPlacement() {
    uiSession++; issueRequest++; openingIssue = 0; cancelPick(); closeDraft(); identity.hidden = true; notice.hidden = true;
    prepareListReveal(); panel.hidden = !open; updateChrome(); if (open) render(); drawPins();
  }
  function cancelPick() { picking = false; highlight.hidden = true; }
  document.addEventListener('pointermove', event => {
    if (!picking || event.composedPath().includes(host)) return;
    const rect = event.target.getBoundingClientRect(); highlight.hidden = false; Object.assign(highlight.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  }, true);
  document.addEventListener('click', event => {
    if (!picking || event.composedPath().includes(host)) return;
    event.preventDefault(); event.stopImmediatePropagation(); const target = event.target; notice.hidden = true;
    const anchor = makeTarget(target, event.clientX, event.clientY); if (anchor) newDraft(anchor);
  }, true);
  function dismissInterface() {
    closeStatusFilter(); captureThreadScroll(); uiSession++; issueRequest++; openingIssue = 0;
    selected = null; targetIssueShortcuts(null); open = false; cancelPick(); closeDraft(); clearAttachments();
    identity.hidden = true; panel.hidden = true; issuePopup.hidden = true; notice.hidden = true;
    panel.removeAttribute('data-continuing'); viewButton.setAttribute('aria-expanded', 'false'); updateChrome(); drawPins(); launcher.focus(); hideTooltip();
  }
  window.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (mentionKey(event)) return;
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Escape' || event.key === 'Esc') {
      hideTooltip();
      const editForm = event.composedPath().find(node => node instanceof Element)?.closest('[data-edit-comment]');
      if (editForm) { consume(); editDrafts.delete(editForm.dataset.editComment); mentionDrafts.delete('edit:' + editForm.dataset.editComment); notice.hidden = true; renderIssue(); return; }
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
    if (key === 'c') { consume(); if (picking || draft || !identity.hidden) stopPlacement(); else withIdentity(startPick); return; }
    if (key === 'v') { consume(); viewButton.click(); return; }
    if (picking && event.key.toLowerCase() === 'p') { consume(); newDraft({ selector: '', text: 'Page feedback', x: .5, y: .5 }); return; }
    if (draft || picking || pinDrag || !identity.hidden) return;
    if ((key === 'n' || key === 'p') && selected && !issuePopup.hidden) {
      consume(); targetIssueShortcuts(selected.id); stepIssue(key === 'n' ? 1 : -1); return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!open && issuePopup.hidden) return;
      consume(); targetIssueShortcuts(selected?.id || null); stepIssue(event.key === 'ArrowDown' ? 1 : -1); return;
    }
    const status = Object.keys(statusKeys).find(value => statusKeys[value] === event.key);
    if (!status) return;
    const id = shortcutIssueId || selected?.id;
    const issue = selected?.id === id ? selected : issues.find(item => item.id === id) || pageIssues.find(item => item.id === id);
    if (!issue || issue.pending || (issue.status === status && !issue.conflict)) return;
    const row = !panel.hidden && panel.querySelector(`[data-issue="${id}"]`);
    const pin = pins.querySelector(`[data-pin-issue="${id}"]`);
    if (!row && !pin && (issuePopup.hidden || selected?.id !== id)) return;
    consume(); withIdentity(() => setStatus(issue, status));
  }, true);
  const normalizeTargetText = value => (value || '').trim().replace(/\s+/g, ' ').slice(0, 240);
  const targetText = node => normalizeTargetText(node.textContent || node.getAttribute('alt') || node.tagName);
  function resourcePath(value) {
    if (!value) return '';
    try { const url = new URL(value, document.baseURI); return /^https?:$/.test(url.protocol) ? url.pathname : ''; } catch (_) { return ''; }
  }
  function stableTargetId(node) {
    const id = node.id;
    return id && id.length <= 200 && !/^(wpadminbar|wp-block-|react-|:r)|(?:^|[-_])[a-f0-9]{6,}$/i.test(id) ? id : '';
  }
  function targetClasses(node) {
    return [...node.classList].filter(value => /^[a-zA-Z_][\w-]{0,79}$/.test(value) && !/^(is-|has-|active$)|\d{3,}|(?:^|[-_])[a-f0-9]{6,}$/i.test(value)).slice(0, 6);
  }
  function pageDimensions() {
    const room = document.documentElement.hasAttribute('data-feedbackpress-room'), rect = document.documentElement.getBoundingClientRect();
    return { width: room ? rect.width : Math.max(document.documentElement.scrollWidth, innerWidth), left: room ? rect.left + scrollX : 0, height: Math.max(document.documentElement.scrollHeight, innerHeight) };
  }
  function makeTarget(node, clientX, clientY) {
    if (!node || node === host || host.contains(node) || node.closest('#wpadminbar,[data-feedbackpress-private]')) return null;
    const rect = node.getBoundingClientRect(), id = stableTargetId(node), classes = targetClasses(node);
    const landmark = node.closest('main,header,footer,nav,article,[role="main"]');
    const fingerprint = { version: 1, tag: node.tagName.toLowerCase(), id, classes,
      selectors: [...new Set([selector(node), selector(node, false), ...(id ? ['#' + CSS.escape(id)] : []), ...(classes.length ? [node.tagName.toLowerCase() + classes.slice(0, 2).map(value => '.' + CSS.escape(value)).join('')] : [])])].filter(value => value.length <= 2000).slice(0, 5),
      href: resourcePath(node.getAttribute('href')), src: resourcePath(node.getAttribute('src')) };
    if (landmark) fingerprint.landmark = { tag: landmark.tagName.toLowerCase(), selector: selector(landmark), id: stableTargetId(landmark) };
    const dimensions = pageDimensions();
    return { selector: selector(node), text: targetText(node),
      x: rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : .5,
      y: rect.height ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : .5,
      fingerprint, page: { x: Math.max(0, Math.min(dimensions.width, scrollX + clientX - dimensions.left)), y: Math.max(0, Math.min(dimensions.height, scrollY + clientY)), width: dimensions.width, height: dimensions.height } };
  }
  const targetResolutions = new WeakMap();
  let targetEpoch = 0;
  function resolveTarget(issue) {
    const saved = issue.target, cached = targetResolutions.get(saved);
    if (cached?.epoch === targetEpoch && (!cached.value?.node || cached.value.node.isConnected)) return cached.value;
    const value = resolveTargetUncached(issue); targetResolutions.set(saved, { epoch: targetEpoch, value }); return value;
  }
  function resolveTargetUncached(issue) {
    const saved = issue.target;
    if (!saved.selector) return null;
    const find = value => { try { return [...document.querySelectorAll(value)].filter(node => node !== host && !host.contains(node) && !node.closest('#wpadminbar,[data-feedbackpress-private]')); } catch (_) { return []; } };
    const f = saved.fingerprint;
    if (f?.version === 1) {
      const bySelector = new Set((f.selectors || []).flatMap(find));
      const candidates = new Set([...bySelector, ...find(f.tag)]);
      let landmarks = f.landmark ? find(f.landmark.selector) : [];
      if (!landmarks.length && f.landmark) landmarks = find(f.landmark.id ? '#' + CSS.escape(f.landmark.id) : f.landmark.tag);
      const text = normalizeTargetText(saved.text);
      const meaningfulText = text.toLowerCase() !== f.tag;
      const ranked = [];
      for (const node of candidates) {
        if (node.tagName.toLowerCase() !== f.tag) continue;
        const inLandmark = landmarks.some(parent => parent === node || parent.contains(node));
        const sameId = f.id && node.id === f.id;
        if (f.landmark && !inLandmark && !sameId) continue;
        const currentText = targetText(node);
        const sameText = meaningfulText && text && text === currentText;
        const relatedText = meaningfulText && text.length >= 20 && currentText.length >= 20 && (text.includes(currentText) || currentText.includes(text));
        const sameResource = (f.href && resourcePath(node.getAttribute('href')) === f.href) || (f.src && resourcePath(node.getAttribute('src')) === f.src);
        const classScore = Math.min(15, (f.classes || []).filter(value => node.classList.contains(value)).length * 5);
        const score = 10 + (sameId ? 100 : 0) + (sameText ? 45 : relatedText ? 20 : 0) + (sameResource ? 45 : 0) + classScore + (bySelector.has(node) ? 10 : 0) + (inLandmark ? 25 : f.landmark ? -55 : 0);
        if (sameId || sameText || relatedText || sameResource) ranked.push({ node, score });
      }
      ranked.sort((a, b) => b.score - a.score);
      // A selector alone is not identity; duplicate or weak candidates use the saved page point.
      if (ranked[0]?.score >= 55 && (!ranked[1] || ranked[0].score - ranked[1].score >= 15)) return { node: ranked[0].node, approximate: false };
      return { node: null, approximate: true };
    }
    // Existing notes retain their original data; recover their selector without rewriting it.
    const exact = find(saved.selector)[0];
    if (exact) return { node: exact, approximate: false };
    const parts = saved.selector.split(' > '), text = normalizeTargetText(saved.text);
    const landmark = parts.findIndex(part => /^(main|header|footer)(?:[.#:]|$)/.test(part));
    for (let start = 1; start <= (landmark < 0 ? parts.length - 1 : landmark); start++) {
      const candidates = find(parts.slice(start).join(' > ')).filter(node => !text || targetText(node) === text);
      if (candidates.length === 1) return { node: candidates[0], approximate: false };
    }
    if (saved.page) return { node: null, approximate: true };
    for (let end = parts.length - 1; end > 0; end--) for (let start = 0; start < end; start++) {
      const candidates = find(parts.slice(start, end).join(' > '));
      if (candidates.length === 1) return { node: candidates[0], approximate: true };
    }
    return { node: document.body, approximate: true };
  }
  function targetPoint(issue, resolved = resolveTarget(issue)) {
    if (!resolved) return null;
    if (resolved.node) {
      const rect = resolved.node.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { x: rect.left + rect.width * issue.target.x, y: rect.top + rect.height * issue.target.y };
    }
    const saved = issue.target.page;
    if (!saved) return null;
    const dimensions = pageDimensions();
    return { x: dimensions.left + Math.max(15, Math.min(dimensions.width - 15, saved.x / saved.width * dimensions.width)) - scrollX,
      y: Math.max(15, Math.min(dimensions.height - 15, saved.y / saved.height * dimensions.height)) - scrollY };
  }
  function locate(issue) {
    const resolved = resolveTarget(issue);
    if (!resolved) return;
    const target = resolved.node;
    if (resolved.approximate) message('Showing an approximate pin location. Use the screenshot for context, or drag the pin to refine it.');
    if (!target) {
      const point = targetPoint(issue, resolved);
      if (point) window.scrollTo({ top: scrollY + point.y - innerHeight / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      return;
    }
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
    const target = makeTarget(node, x, y); return target ? { node, rect, target } : null;
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
    const existing = new Map([...pins.children].map(pin => [pin.dataset.pinIssue, pin])), retained = new Set();
    const visible = pageIssues.filter(issue => filter.includes(issue.status));
    if (selected && !visible.some(issue => issue.id === selected.id)) visible.push(selected);
    visible.filter(issue => issue.path === pagePath && issue.target.selector).forEach(issue => {
      const resolved = resolveTarget(issue); if (!resolved) return;
      const point = targetPoint(issue, resolved); if (!point) return;
      let pin = existing.get(issue.id);
      if (!pin) {
        pin = button(String(issue.number), () => withIdentity(() => showIssue(issue.id)));
        pin.dataset.pinIssue = issue.id; pin.addEventListener('pointerdown', event => beginPinDrag(event, pin, pin.feedbackpressIssue)); pins.append(pin);
      }
      retained.add(issue.id); pin.feedbackpressIssue = issue; pin.style.pointerEvents = '';
      const className = 'pin ' + (String(issue.number).length > 4 ? 'is-wide ' : '') + issue.status + (selected?.id === issue.id ? ' is-selected' : '');
      if (pin.className !== className) pin.className = className;
      if (pin.textContent !== String(issue.number)) pin.textContent = String(issue.number);
      pin.setAttribute('aria-label', `Issue ${issue.number}, ${labels[issue.status]}: ${(issue.title || issue.body).slice(0, 90)}`);
      pin.dataset.tooltip = (issue.title || issue.body || 'Issue ' + issue.number).slice(0, 120);
      if (resolved.approximate) pin.dataset.tooltipNote = 'Approximate location';
      else delete pin.dataset.tooltipNote;
      pin.dataset.approximate = String(resolved.approximate); pin.style.left = `${point.x}px`; pin.style.top = `${point.y}px`;
    });
    for (const [id, pin] of existing) if (!retained.has(id)) pin.remove();
  }
  let frame = null;
  const redraw = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = null; if (open) panel.hidden = innerWidth < 900 && (picking || Boolean(draft) || selected && !issuePopup.hidden); updateChrome(); drawPins(); positionDraft(); }); };
  new ResizeObserver(() => positionDraft()).observe(issuePopup);
  new ResizeObserver(() => positionDraft()).observe(composer);
  new ResizeObserver(() => positionDraft()).observe(toolbar);
  addEventListener('scroll', redraw, { passive: true }); addEventListener('resize', redraw);
  addEventListener('load', redraw);
  // Page builders can reveal the saved element after the initial page/API load.
  new MutationObserver(records => { const changed = records.filter(record => record.target !== host && !host.contains(record.target)); if (changed.length) { if (changed.some(record => record.attributeName !== 'style')) targetEpoch++; redraw(); } }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'id', 'href', 'src', 'alt', 'role'], characterData: true });
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
  const sharedJobs = new Map(), ownRevisions = new Map();
  const revisionsKey = cacheKey + ':revisions';
  try { for (const [id, revisions] of JSON.parse(sessionStorage.getItem(revisionsKey) || '[]')) ownRevisions.set(id, new Map(revisions)); } catch (_) {}
  let textTail = Promise.resolve();
  const journalKey = cacheKey + ':work', journal = new Map();
  try { for (const job of JSON.parse(sessionStorage.getItem(journalKey) || '[]')) journal.set(job.id, job); } catch (_) {}
  const workPanel = el('aside', { class: 'work-panel', 'aria-label': 'Background activity', hidden: true }); root.append(workPanel);
  const workDatabase = new Promise(resolve => {
    if (!window.indexedDB) return resolve(null);
    const request = indexedDB.open('feedbackpress-work', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('jobs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null);
  });
  async function storeJob(job, remove = false) {
    if (job.private) return;
    job.updatedAt = Date.now();
    if (remove) journal.delete(job.id); else journal.set(job.id, { ...job, files: [], missingFiles: job.files.length || job.missingFiles || 0 });
    try { sessionStorage.setItem(journalKey, JSON.stringify([...journal.values()])); } catch (_) {}
    const db = await workDatabase;
    if (!db) return;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('jobs', 'readwrite');
      if (remove) transaction.objectStore('jobs').delete(job.id); else transaction.objectStore('jobs').put(job);
      transaction.oncomplete = resolve; transaction.onerror = () => reject(new Error('Browser storage is full. Keep this page open to retry.'));
    });
  }
  function optimisticIssue(issue) {
    let result = issue;
    for (const job of sharedJobs.values()) {
      if (job.issueId !== issue.id || job.phase !== 'text' || job.error) continue;
      if (job.kind === 'edit') {
        const comment = job.path.split('/')[3];
        result = comment === issue.id ? { ...result, body: job.body.body, mentions: job.body.mentions || [], ...(job.body.title !== undefined ? { title: job.body.title } : {}), pending_edit: true } : { ...result, activity: result.activity.map(event => event.id === comment ? { ...event, payload: { ...event.payload, body: job.body.body, mentions: job.body.mentions || [], pending_edit: true } } : event) };
      }
      if (job.kind === 'status') result = { ...result, status: job.body.status };
      if (job.kind === 'reply' && !result.activity.some(event => event.id === job.id)) result = { ...result, activity: [...result.activity, { id: job.id, kind: 'reply', created_at: job.createdAt, payload: { body: job.body.body, mentions: job.body.mentions || [], author: job.body.author || c.userName, author_id: actorId, pending: true } }] };
    }
    return result;
  }
  function renderJobs() {
    workPanel.hidden = !sharedJobs.size;
    workPanel.replaceChildren(...[...sharedJobs.values()].map(job => {
      const label = job.error ? job.error : job.phase === 'done' ? 'Saved' : job.phase === 'files' ? 'Uploading ' + (job.files[0]?.file.name || 'screenshot') + (job.files.length > 1 ? ' (' + job.files.length + ' remaining)' : '') + '…' : 'Saving ' + (job.kind === 'create' ? 'feedback' : job.kind) + '…';
      return el('div', { class: 'work-item', 'data-state': job.error ? 'error' : job.phase, role: 'status' }, el('span', { class: 'work-indicator', 'aria-hidden': 'true' }, job.phase === 'done' ? icon('check') : job.error ? icon('close') : null), el('span', {}, label),
        job.error ? button('Retry', () => { delete job.error; if (job.retry) job.retry(); else executeJob(job); }) : null,
        job.error && job.missingFiles ? el('input', { type: 'file', multiple: true, 'aria-label': 'Reattach interrupted files', onchange: event => { job.files = [...event.target.files].map(file => ({ file, key: crypto.randomUUID(), screenshot: false })); job.missingFiles = 0; delete job.error; executeJob(job); } }) : null,
        job.error && !job.private && job.phase === 'text' && job.kind !== 'status' ? button('Restore draft', () => restoreJob(job).catch(error => message(error.message))) : null,
        job.phase === 'done' ? button('Dismiss', () => { sharedJobs.delete(job.id); renderJobs(); }, { class: 'fp-quiet' }) : null);
    }));
  }
  function matchesView(issue) {
    return filter.includes(issue.status) && matchesListSearch(issue);
  }
  function showPendingCreate(job) {
    if (job.phase !== 'text' || job.kind !== 'create') return;
    const item = { ...job.body, id: job.id, number: '…', author: c.userName || job.body.author, pending: true, revision: 0, target_revision: 0, activity: [], files: [], created_at: job.createdAt };
    if (!matchesView(item)) return;
    if (!issues.some(issue => issue.id === job.id)) { issues.push(item); total++; }
    if (item.path === pagePath && !pageIssues.some(issue => issue.id === job.id)) pageIssues.push(item);
    if (open) render(); drawPins();
  }
  function enqueueShared(kind, path, body, files = [], capturePromise = null, key = crypto.randomUUID()) {
    const job = { id: key, scope: cacheKey, kind, path, body, files: files.map(file => ({ file, key: crypto.randomUUID(), screenshot: false })), phase: 'text', issueId: kind === 'create' ? null : path.split('/')[1], issuePath: kind === 'create' ? body.path : (issueCache.get(path.split('/')[1])?.issue.path || selected?.path || pagePath), createdAt: new Date().toISOString(), capturePending: Boolean(capturePromise) };
    sharedJobs.set(job.id, job); showPendingCreate(job); renderJobs();
    if (job.issueId) { const current = issueCache.get(job.issueId)?.issue || selected; if (current) applyIssue(current); }
    executeJob(job, capturePromise); return job;
  }
  async function executeJob(job, capturePromise = null) {
    // running is kept outside the persisted descriptor so navigation can resume interrupted work.
    const running = executingJobs.has(job.id); if (running) return; executingJobs.add(job.id); renderJobs();
    try {
      await storeJob(job);
      if (job.phase === 'text') {
        const send = textTail.catch(() => {}).then(async () => {
          if (!job.sentBody) {
            job.sentBody = { ...job.body };
            if (job.sentBody.revision) {
              const revisions = ownRevisions.get(job.issueId);
              for (let depth = 0; depth < 200 && revisions?.has(String(job.sentBody.revision)); depth++) {
                const next = revisions.get(String(job.sentBody.revision)); if (String(next) === String(job.sentBody.revision)) break; job.sentBody.revision = next;
              }
            }
            await storeJob(job);
          }
          const saved = await (await api(job.path, { method: 'POST', body: job.sentBody, requestId: job.id })).json();
          if (job.sentBody.revision) {
            if (!ownRevisions.has(job.issueId)) ownRevisions.set(job.issueId, new Map());
            const revisions = ownRevisions.get(job.issueId); revisions.set(String(job.sentBody.revision), saved.revision);
            while (revisions.size > 20) revisions.delete(revisions.keys().next().value);
            while (ownRevisions.size > 200) ownRevisions.delete(ownRevisions.keys().next().value);
            try { sessionStorage.setItem(revisionsKey, JSON.stringify([...ownRevisions].map(([id, values]) => [id, [...values]]))); } catch (_) {}
          }
          const temporary = job.id; job.issueId = saved.id; job.commentId = saved.reply_id || saved.id; job.phase = 'files';
          if (job.kind === 'create') {
            issues = issues.filter(issue => issue.id !== temporary); pageIssues = pageIssues.filter(issue => issue.id !== temporary);
            if (matchesView(saved)) { issues.push(saved); if (saved.path === pagePath) pageIssues.push(saved); }
            if (selected?.id === temporary) selected = saved;
          }
          applyIssue(saved); await storeJob(job);
        });
        textTail = send; await send;
      }
      if (job.capturePending) {
        const image = capturePromise ? await capturePromise : null;
        job.capturePending = false;
        if (image) job.files.unshift({ file: image, key: crypto.randomUUID(), screenshot: true });
        else message('Feedback saved; automatic screenshot was unavailable. You can attach one manually.');
        await storeJob(job);
      }
      if (job.missingFiles) throw new Error('Feedback is saved. Reattach files interrupted before browser storage completed.');
      for (;;) {
        while (job.files.length) {
          renderJobs(); const item = job.files[0];
          await upload(job.issueId, item.file, item.screenshot, job.commentId, item.key);
          job.files.shift(); await storeJob(job);
        }
        await storeJob(job, true);
        if (!job.files.length) break;
      }
      job.phase = 'done'; renderJobs();
      if (job.kind !== 'status') api('issues/' + job.issueId).then(response => response.json()).then(applyIssue).catch(() => {});
      setTimeout(() => { if (job.phase === 'done') { sharedJobs.delete(job.id); renderJobs(); } }, 6000);
    } catch (error) {
      job.error = error.message; await storeJob(job).catch(() => {}); renderJobs();
      if (job.kind === 'status' || job.kind === 'edit') { const current = issueCache.get(job.issueId)?.issue; if (current) applyIssue(current); }
    } finally { executingJobs.delete(job.id); }
  }
  function privateWork(label, work) {
    const job = { id: crypto.randomUUID(), kind: label, phase: 'text', private: true, files: [] };
    job.retry = async () => {
      renderJobs();
      try { await work(); job.phase = 'done'; renderJobs(); setTimeout(() => { sharedJobs.delete(job.id); renderJobs(); }, 6000); }
      catch (error) { job.error = error.message; renderJobs(); }
    };
    sharedJobs.set(job.id, job); job.retry();
  }
  const executingJobs = new Set();
  async function restoreJob(job) {
    if (job.issuePath && job.issuePath !== pagePath) {
      job.restoreRequested = true; await storeJob(job);
      captureListScroll(); saveView(); location.assign(c.home + job.issuePath + (job.issueId ? '#feedbackpress=' + job.issueId : '')); return;
    }
    if (job.kind === 'create') {
      newDraft(job.body.target); draftOperation = job.id;
      composer.querySelector('[name=title]').value = job.body.title; restoreMentionField(composer.querySelector('[name=body]'), job.body.body, job.body.mentions);
      composer.querySelector('form').feedbackpressFiles.push(...job.files.map(item => item.file));
      issues = issues.filter(issue => issue.id !== job.id); pageIssues = pageIssues.filter(issue => issue.id !== job.id);
    } else if (job.kind === 'edit') {
      await showIssue(job.issueId); const id = job.path.split('/')[3];
      editDrafts.set(id, { issue: job.issueId, body: job.body.body, mentions: job.body.mentions || [], title: job.body.title || '', revision: selected.revision, requestId: job.id }); renderIssue();
    } else {
      await showIssue(job.issueId); replyOperations.set(job.issueId, { key: job.id }); replyDrafts.set(job.issueId, job.body.body); mentionDrafts.set('reply:' + job.issueId, { text: job.body.body, ranges: job.body.mentions || [] }); replyFiles.set(job.issueId, job.files.map(item => item.file)); renderIssue();
    }
    sharedJobs.delete(job.id); await storeJob(job, true); renderJobs(); drawPins();
  }
  async function resumeJobs() {
    const db = await workDatabase;
    const saved = db ? await new Promise(resolve => { const request = db.transaction('jobs').objectStore('jobs').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve([]); }) : [];
    const recovered = new Map([...journal.values()].map(job => [job.id, job]));
    for (const job of saved) {
      const newer = recovered.get(job.id);
      if (newer && newer.updatedAt > (job.updatedAt || 0)) {
        const count = newer.missingFiles || 0;
        recovered.set(job.id, { ...newer, files: count ? job.files.slice(-count) : [], missingFiles: Math.max(0, count - job.files.length) });
      } else recovered.set(job.id, job);
    }
    for (const job of [...recovered.values()].filter(job => job.scope === cacheKey).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      sharedJobs.set(job.id, job); showPendingCreate(job); if (job.restoreRequested) await restoreJob(job); else if (!job.error) executeJob(job);
    }
    renderJobs();
  }
  addEventListener('hashchange', () => { const linked = location.hash.match(/^#feedbackpress=([a-f0-9-]{36})$/)?.[1]; if (linked) withIdentity(() => showIssue(linked)); });
  const id = location.hash.match(/^#feedbackpress=([a-f0-9-]{36})$/)?.[1];
  if (id) withIdentity(() => showIssue(id));
  else if (resumeOpen && restoredDetails && restoredSelection && selected?.path === pagePath) withIdentity(() => { open = true; showIssue(restoredSelection, false); });
  else if (resumeOpen || new URLSearchParams(location.search).get('feedbackpress') === 'open') withIdentity(() => toggle(true));
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
      if (!cacheDenied && Array.isArray(data.issues) && writeVersion === localWriteVersion) {
        const byId = new Map(data.issues.map(issue => [issue.id, issue]));
        const matches = matchesView;
        const visible = new Set(issues.map(issue => issue.id));
        // Keep each visible row in place, including status changes received from another site.
        issues = issues.filter(issue => byId.has(issue.id) || issue.pending).map(issue => byId.has(issue.id) ? optimisticIssue(byId.get(issue.id)) : issue);
        // The gateway offers all snapshot IDs; only an ID absent from the prior snapshot is new.
        for (const id of data.new_issues || []) { const issue = byId.get(id); if (knownIssues && !knownIssues.has(id) && issue && !visible.has(id) && matches(issue)) { issues.push(issue); total++; } }
        knownIssues = new Set(byId.keys());
        statusCounts = Object.fromEntries(Object.keys(labels).map(status => [status, 0])); countedStatuses.clear();
        for (const item of data.issues) { const current = optimisticIssue(item), matches = matchesListSearch(current); countedStatuses.set(item.id, { status: current.status, matches }); if (matches) statusCounts[current.status]++; }
        paintStatusCounts();
        keepListOrder = listLoaded;
        pageIssues = data.issues.filter(issue => issue.path === pagePath && matches(issue)).map(optimisticIssue);
        for (const job of sharedJobs.values()) showPendingCreate(job);
        const editing = root.activeElement?.matches('input, textarea, select, [contenteditable]') || draft || busy;
        if (selected && byId.has(selected.id)) { selected = byId.get(selected.id); deferredIssueRender = Boolean(editing); if (!editing && !issuePopup.hidden) renderIssue(); }
        if (!editing) {
          if (open) render();
          updateNavigation();
        } else if (open && root.activeElement?.matches('.issue-search')) render();
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
  resumeJobs().catch(() => message('Queued browser work could not be restored. Keep this page open and retry.'));
  if (c.activitySync) syncActivity();
  if (!requestNumber) load();
})();
