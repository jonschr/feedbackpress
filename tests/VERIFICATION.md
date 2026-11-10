# Initial release verification — 2026-11-05

- PHP lint: all plugin and integration-test files passed.
- JavaScript syntax: passed Node's syntax check.
- Integration suite: 21 assertions passed on local WordPress test site. Covers status workflow, required names, relative paths, replies, revision conflicts, offline status merge/resolution, attachment integrity/expiration, restricted reads, authenticated writes, and invalid file content.
- Actual two-installation HTTP test: a temporary WordPress 6.9 peer received an issue and PDF. A reply and Review status created on that peer arrived locally. Repeat sync did not duplicate events. Plain-permalink peer URLs worked. Local CA validation remained enabled using the development CA certificate in the test HTTP client.
- Headless Chrome on the actual client homepage: created feedback with an automatic screenshot, changed status to Review, and added a reply; no JavaScript page errors. Tested 1440×1000 desktop and 390×844 mobile; sidebar client and scroll widths both 366px on mobile.
- Element selection intercepted link navigation and produced a pin. PDF upload and download worked from the browser.
- Settings screen rendered, and the 30-minute cron event was present.
- Test-authored issues and files removed; temporary peer site deleted; original local environment configuration restored.

Not tested: actual production/staging hosts or their firewalls, Safari/Firefox, multisite, sustained public abuse, or large review histories. Screen reconstruction retains the limitations documented in README.

## 0.1.1 interaction refinement

- 23 integration assertions passed, including WordPress display-name attribution and frontend identity configuration.
- Headless Chrome on the client site: first interaction prompts once for a guest name; the SameSite=Lax cookie survives reload. No name field appears in the composer, reply, or status forms.
- Desktop 1440×1000 and mobile 390×844: composer is tethered to the dropped pin and remains inside the viewport. Submission closes the composer without opening the sidebar. Escape cancels a draft.
- Command+Enter submitted an issue with its screenshot; Ctrl+Enter submitted a reply; plain Enter preserved a newline without submitting. No JavaScript page errors.
- Test-authored feedback and its files were removed; other feedback was preserved.
- Safari/Firefox and an actual mobile software keyboard were not tested.

## 0.1.2 minimal composer

- Browser checks passed for icon-only close, outlined field, no composer heading/checkbox/helper copy, and shortcut tooltip.
- Paperclip opened a multiple-file picker. Adding another selection preserved existing files; removing a selected file worked. Submission produced two user attachments plus one automatic screenshot, all available through the API.
- Injected conflicting page button/textarea/class styles did not alter widget colors or borders inside Shadow DOM. Frontend button classes are plugin-prefixed and do not use WordPress button styles.
- Desktop/mobile composer, remembered identity, Command+Enter issue submission, Ctrl+Enter reply submission, plain Enter newline, and Escape cancellation checks passed. No JavaScript page errors.
- JavaScript syntax and plugin bootstrap PHP lint passed. Test-authored feedback removed; other feedback preserved.

## 0.1.3 continuous pin placement

- Chrome: submitted two consecutive issues without clicking Leave feedback again. Page actions remained intercepted for pin placement after each successful submission.
- X discarded a draft and returned to placement. Escape exited placement both between issues and while drafting; normal page clicks resumed. Reloading did not restore placement mode.
- No JavaScript page errors. JavaScript syntax and bootstrap PHP lint passed. Test-authored issues/files removed; other feedback preserved.
- Safari and Firefox were not tested for this change.

## 0.1.4 permanent issue numbers

- 28 integration assertions passed. New coverage includes persistent numbering, increasing numbers without changing old ones, sync validation, order-independent reduction, and legacy assignment events.
- Chrome: adding another issue did not change the first pin number. Hiding/showing status filters, opening details, and reloading retained the same references; the list and detail badges matched the pins.
- Existing feedback is numbered once through immutable assignment events. New issue numbers are stored in their creation events. Environment prefixes prevent independent staging/production counters from colliding with local references.
- PHP lint and JavaScript syntax checks passed. Test feedback removed; existing user feedback preserved.
- Safari/Firefox and live multi-host deployments were not re-tested for this change; sync event preservation was checked in the integration suite.

## 0.1.5 locate issues on opening

- Chrome browser fixture using the installed plugin script and actual WordPress API: pin clicks, list rows, initial fragment links, same-page fragment changes, and cross-page issue navigation scrolled to the saved point.
- Verified exact positioning near the bottom of a tall element, nested scroll containers, smooth scrolling, and instant scrolling for reduced-motion users. Missing targets kept issue details accessible.
- Reply refresh preserved document position. A request counter prevents older issue-open responses from overriding a newer selection.
- JavaScript syntax and bootstrap PHP lint passed. Test-authored issues were removed; other feedback preserved. Safari/Firefox were not retested.

## 0.1.6 all-pages review list and pin conversations

- 32 integration assertions passed, including natural number ordering before pagination, page grouping, focused issue pagination, and page clamping.
- Chrome: all-pages list defaults, page/number ordering, highlighted selection, pin-anchored conversation, previous/next across site pages, completion/status changes from both views, popup replies via Command+Enter, and attachments preserving an unsent reply passed. Competing status updates returned the current server status without discarding the typed reply.
- Previous/next crossed the 50-item boundary in both directions. Closing/reopening only the sidebar preserved the popup and highlighted selection. Current-page pins are fetched independently of sidebar pagination.
- Desktop and 390px mobile layouts checked in a browser fixture and on the actual local test site. The popup and list do not overlap on desktop; mobile switches between views. Simple issue popup approximately 250px tall, with a bounded scrolling thread for longer content.
- Regression checks passed for continuous pin placement, icon-based multi-file uploads, automatic screenshots, keyboard submission, cookie identity, and theme-style isolation. No JavaScript page errors in workflow tests.
- PHP lint and JavaScript syntax passed. Test-authored feedback removed; existing client feedback preserved. Local test throttles cleared after browser checks. Safari and Firefox were not tested.

## 0.1.7 status action icons and shortcuts

- Chrome desktop/mobile: every row and popup shows exactly three destination actions and omits the current status. No per-issue status dropdown or completion toggle remains.
- Verified one-click changes from both views, changing an unselected row without changing the selected issue, and all four selected-issue shortcuts (1 To do, 2 Doing, 3 Review, 4 Done). Tooltips and selected-action ARIA shortcuts expose the mapping.
- Reply fields, ordinary page inputs, and contenteditable elements accepted the numbers without changing issue status. Unsent replies survived status changes. Shortcuts worked from the mobile list while its popup was hidden.
- Popup positioning reserves space for the launcher buttons, keeping View issues accessible near viewport edges.
- JavaScript syntax and PHP bootstrap lint passed. No JavaScript page errors in the browser checks. Test-authored issues removed and local test throttles cleared; existing feedback preserved. Safari/Firefox were not tested.

## 0.1.8 inline attachments, lightbox, and reply shortcuts

- Chrome desktop/mobile: inline image thumbnails and PDF document tiles replaced the attachment disclosure. Image and native PDF lightboxes opened, downloads retained filenames, and Escape/focus restoration returned to the same issue. The PDF page visibly rendered in the native viewer.
- Authenticated file-fetch headers, per-issue blob caching, object URL revocation, and mobile dialog bounds verified. Status shortcuts stayed inactive while the modal was open.
- Actual Command+Enter and Ctrl+Enter submitted replies without clicking the Reply button. Plain Enter inserted a newline; exactly one reply request was sent per shortcut. Handling now uses document capture with the composed event path to find the focused widget form across Shadow DOM.
- Existing client screenshot preview was checked on the actual local test site at desktop and mobile sizes without changing its feedback.
- JavaScript syntax and PHP bootstrap lint passed. No JavaScript page errors. Test issues/uploads removed and local test throttles cleared; existing client feedback preserved. Safari/Firefox were not tested; PDF rendering uses the browser's native viewer with Open PDF/Download fallbacks.

## 0.1.9 separate screenshot and per-comment uploads

- 37 integration checks passed, including stable reply IDs, upload comment validation, comment association in stored/synced metadata, legacy fallback, and malformed sync reference rejection.
- Chrome desktop/mobile: automatic screenshot thumbnails align on the right under their comment; uploaded images/PDFs align left under the correct original comment or reply. Both reuse lightbox/download controls.
- Reply files queue until submission. Command+Enter posted the reply and linked its files to its returned comment ID. Simulated upload failure retained pending files; retry completed the transfer without duplicating the reply.
- Existing files without comment metadata remain under the original issue comment. Comment IDs are carried in file events for synchronization; uploads cannot reference a comment from another issue.
- PHP lint and JavaScript syntax passed. No JavaScript page errors. Test-authored feedback/media removed and local test throttles cleared; existing client feedback preserved. Safari/Firefox were not tested.

## 0.1.10 capture keyboard routing and complete dismissal

- Reproduced the previous failure with an intervening document-level widget listener that swallowed Escape and status keys before the plugin's bubbling handlers could receive them.
- The real plugin script now handles shortcuts at window capture. Browser regression checks passed for Escape, all four status keys, Command+Enter, and typing guards under that interfering listener.
- Escape dismisses the active feedback interface in one step, including while an issue fetch or a submitted save is pending. Delayed issue reads, status updates, replies, and new-issue saves did not reopen UI or resume placement after dismissal. Submitted data completes in the background.
- Attachment modal Escape closes only the preview first, and status keys remain inactive while previewing.
- Checked Escape directly on the actual local test page without modifying client feedback. Regression fixtures used intercepted API responses rather than temporary client issues.
- JavaScript syntax and PHP bootstrap lint passed. Safari/Firefox were not tested.

## 0.1.11 authors and roomier comment layout

- Chrome desktop/mobile: each comment/reply shows a clear semibold author name and separate date. Attachment lightboxes identify the associated comment author, including different reply authors, without assigning an unknown reply's files to the original author.
- Popup width increased from 336px to 384px (clamped to the viewport), available conversation height increased from 240px to 360px, and popup height cap increased to 620px. Thumbnail width reduced from 78px to 64px.
- Automatic screenshot thumbnails align at the right beside comment text; uploaded files remain below the text on the left. Verified geometry at 1440×1000 and 390×844 and inspected settled renders.
- Lightbox authors, preview access, mobile viewport bounds, PHP bootstrap lint, and JavaScript syntax passed. Browser tests used intercepted fixture responses; no client feedback was changed. Safari/Firefox were not tested.

## 0.1.12 multi-status checkbox filter and status accents

- Chrome desktop/mobile: custom checkbox disclosure supports arbitrary status combinations, including none/all; new-session default remains To do + Review. Selections persist across reloads, and legacy single-status preferences are read compatibly.
- Checkbox updates keep the menu open and retain keyboard focus. Native Space toggles options; Escape closes the menu and restores its trigger before dismissing the interface on a subsequent Escape. Outside clicks close the menu. Page pins track the same status combination.
- List rows and issue popups have thin status-colored leading edges. Done rows/popups remain muted gray even when selected, including status actions, badges, reply controls, and thumbnails. Original-color attachment previews remain available in the lightbox.
- Verified empty selection, persistence, menu bounds at 390px, selected completed styling, status hotkeys after closing the filter, and disabled status hotkeys inside the open filter. No JavaScript page errors or client data changes.
- JavaScript syntax and PHP bootstrap lint passed. Safari/Firefox were not tested.

## 0.1.13 number-line status icons

- Chrome desktop/mobile: list rows and popup headers always show all four status icons, exactly one highlighted with aria-pressed. Written row status labels and popup badges are removed; tooltips and 1–4 shortcuts remain.
- Verified icon alignment with the issue number, separation from the comment below, popup header placement, and mobile viewport bounds. Current-status clicks send no update; completed issues retain gray styling including the selected icon.
- Checkbox filter combinations, persistence, focus, Escape, outside dismissal, matching pins, and attachment preview color checks still pass. Keyboard regression checks pass for Escape, 1–4, Command+Enter, typing guards, and delayed saves under an interfering document listener.
- JavaScript syntax and PHP bootstrap lint passed. Tests used intercepted API fixtures; no client feedback was changed. Safari/Firefox were not tested.

## 0.1.14 full-text issue search and date sorting

- 17 standalone checks passed using production Store/API code with an in-memory table reader: original/reply matching, Unicode case-insensitivity, terms spanning comments, literal punctuation, status/path intersection, no-status results, clearing search, and filtering/sorting before pagination/focus. No database writes.
- Completion sort uses current Done status timestamps, with unfinished issues last. Reopening clears completion; completing again uses the new date. Last edited includes original issue, replies, status changes, and uploaded-file events, excluding cleanup and numbering. Verified arrival-order independence and conflict behavior.
- Chrome desktop/mobile: minimal search field, focus/caret retention, debouncing and stale response rejection, search/status request parameters, matching page pins, both date sorts, paths on ungrouped rows, selected-issue navigation, empty results, and search/sort/status persistence. Checked settled desktop/mobile renders.
- Read-only smoke checks against the actual local WordPress data confirmed search and both date sorts. Existing keyboard regression checks also passed (Escape, 1–4, Command+Enter, typing guards, late-response dismissal). No client feedback or media was created or changed.
- JavaScript syntax and PHP lint passed. Safari/Firefox were not tested.

## 0.1.15 neutral controls and aligned placement toolbar

- Chrome: pin-placement notices and launcher controls share a centerline at 1440px and 800px. At 390px and 320px, the notice stacks above the right-aligned launchers without horizontal overflow; all controls stay within the viewport. Inspected settled desktop, tablet, and mobile renders.
- General buttons, notices, input carets/focus, panels, highlights, and shadows now use the plugin's neutral black/white/gray palette. Verified default/hover colors and isolation under hostile host-page button/input styles; semantic status colors remain.
- P opens the composer, Escape dismisses it and placement mode, and composer positioning clears the shared toolbar. Toolbar ResizeObserver keeps that clearance when the notice height changes.
- Existing search/sorting and keyboard-capture regression checks passed. JavaScript syntax, PHP bootstrap lint, and archive integrity passed. Browser fixtures intercepted all requests; no client feedback was changed. Safari/Firefox were not tested.

## 0.1.16 instant styled tooltips

- Chrome desktop/mobile: tooltip visibility is synchronous inside the pointerover event; no appearance timer or transition. Keyboard focus also opens the hint immediately. Action labels, current-status labels, shortcut key badges, and selected-issue shortcut notes verified.
- Tooltips remain hoverable, use aria-describedby/role=tooltip, and clean up descriptions when dismissed. Checked viewport clamping, below-control flipping near the top edge, and actual top-layer hit testing inside the attachment dialog. Inspected sidebar, popup, lightbox, and mobile renders.
- Native control titles are removed to prevent duplicate delayed browser hints; PDF iframe accessibility titles remain. Touch pointerover does not create sticky hover hints. Scroll, focus into text fields, click, rerender, and Escape dismissal checks passed.
- Added tests/tooltips.cjs with intercepted browser fixtures and no client writes. Existing Escape/1–4/Command+Enter keyboard regression checks passed. JavaScript syntax, PHP bootstrap lint, and archive integrity passed. Safari/Firefox were not tested.

## 0.1.17 default issue-number ordering

- New browser sessions and API listings now default to natural issue-number ordering across all pages. Explicit page grouping and remembered sort choices remain available.
- Existing 17 search/sort checks, PHP API lint, and JavaScript syntax passed. Chrome fixture check confirmed the initial sort/API request, ungrouped list, and retained explicit page preference after reload. No client data changed. Safari/Firefox were not tested.

## 0.1.18 status-matched hover colors

- Chrome desktop/mobile: verified computed hover and selected colors for all four statuses. Review uses light purple on hover and a stronger purple selected tint; selected rows retain their tint while hovered.
- Status action hover foreground/background matches its destination, status-filter options use the corresponding light tint, and completed rows/actions retain gray overrides. Inspected desktop/mobile renders; no browser errors or client data changes. PHP bootstrap lint passed. Safari/Firefox were not tested.

## 0.1.19 pin markers in automatic screenshots

- Chrome with the real bundled html2canvas-pro renderer: intercepted issue creation and screenshot upload, decoded the actual JPEG, and checked white center/amber marker pixels at the original click position. Inspected the resulting desktop and mobile captures.
- Scrolled desktop capture retained the original point after the element was hidden and the page scrolled again while rendering was pending. High-DPI mobile capture used the correct 1.5x image coordinates, including a click at the viewport edge. Page-feedback capture contained no marker.
- Screenshot failures still saved the issue without an upload. Review controls stayed excluded from the capture. Added tests/screenshot-pin.cjs; no client feedback or media was created or changed. Existing keyboard regression checks passed. JavaScript syntax, PHP bootstrap lint, and archive integrity passed. Safari/Firefox were not tested.

## 0.1.20 passive filtered pins and immediate save confirmation

- Chrome: default To do + Review pins appear before opening the issues panel and remain through panel dismissal, placement, drafting, repeated submissions, and Escape. Custom status selections, no selected statuses, persisted filters, and search all apply with the panel closed.
- A numbered pin appears immediately after issue creation while its screenshot upload is deliberately held; the draft dot disappears. The pin survives failed list refreshes. Creating a To do issue under a Done-only filter does not reveal it.
- Delayed initial reads and saves after Escape update passive pins without reopening the panel/composer or resuming placement. Added tests/passive-pins.cjs with intercepted writes. Inspected desktop/mobile passive pins and the pending-upload state.
- Existing keyboard and real-renderer screenshot-marker regression checks passed. JavaScript syntax, PHP bootstrap lint, and archive integrity passed. No client feedback/media was changed. Safari/Firefox were not tested.

## 0.1.21 C/V launcher shortcuts

- Chrome: C starts placement, V opens/closes the issues sidebar, and both launchers display immediate shortcut key badges and aria-keyshortcuts. C preserves and focuses an existing draft. Inspected the launcher tooltip render.
- Guard checks passed for eleven native input types, textareas, selects, contenteditable, eight custom input roles, an input inside open Shadow DOM, document designMode, modifier combinations, repeat, and composition. Native text inputs, sidebar search, draft text, and replies retain typed c/v characters.
- Mobile V switching between the popup and list matches clicking View issues. Switching into the list removes stale pin-placement instructions. Added tests/navigation-shortcuts.cjs with intercepted API fixtures; no client data changed.
- Existing Escape/1–4/Command+Enter regression checks, JavaScript syntax, PHP bootstrap lint, and archive integrity passed. Safari/Firefox were not tested.

## 0.1.22 JSON plugin update support

- Bundled the same MIT-licensed Plugin Update Checker 5.6 used by Ollie Bridge. A plugins_loaded hook initializes FeedbackPress’s own JSON endpoint and stable plugin slug, independently of review visibility or feedback synchronization settings.
- WordPress smoke checks passed with only FeedbackPress enabled in the test process, during update-AJAX boot, and alongside the normally active plugins (including other PUC consumers). Exactly one FeedbackPress checker is registered with the correct endpoint and plugin basename.
- Plugin header, runtime version, JSON version, and versioned GitHub archive URL agree. Intercepted JSON parsed successfully; the current version produced no update, and a simulated newer version reached WordPress’s plugin update response with the correct package/slug. Synthetic state stayed in memory; no update was installed and no feedback was changed.
- PHP syntax passed for the integration and every bundled library file. The real public JSON feed and tag archive become available after publishing the manifest and release tag; an actual upgrade was not performed.

## 0.1.23 stable issue positions after status changes

- Chrome: sidebar and popup status changes preserve card order and exact vertical positions, including issues leaving the status filter. No relocation into the selected-issue fallback section. Selecting adjacent issues, previous/next navigation, and closing/reopening the panel preserve the retained view.
- Last-edited and completion sorts remain stable after edits; explicit Refresh and browser reload apply the new date order/filter membership. Mobile popup status changes retain the list position when switching back to the sidebar.
- Added tests/stable-status-order.cjs with intercepted API writes. Existing passive-pin and keyboard regression checks passed; no client feedback changed. Syntax, updater version parity/JSON checks, and archive integrity passed. Safari/Firefox were not tested.

## 0.2.0 named networks and activity-triggered sync

- Standalone `php tests/network-sync.php` runs production Store/Network/Sync/Log code against isolated SQLite installations and an intercepted WordPress HTTP transport. Checks cover local/remote joins, Basic Auth, lost join responses and safe retry, a local-only network provisioning its first remote, explicit reconnect after a database copy, credential rotation, copied-URL disconnection, member removal, configuration conflicts under skewed clocks, no-op saves, and network isolation. No external requests or client database writes.
- Two-way issue/status/file propagation, duplicate delivery, missing local/remote attachment repair, and restored event history pass. The transport identifies FeedbackPress, verifies TLS, refuses redirects, honors backoff/Retry-After, and records HTTP 401/403/429/500 plus invalid JSON. Log count/encoded-size/age limits and field allowlisting are checked.
- Chrome `tests/activity-sync.cjs` verifies automatic checks on landing, live snapshots, stable card positions, preserved reply text/caret, hidden/idle pause and interaction resume, failure tolerance, and rejection of stale snapshots after a newer local save. Long prefixed references fit mobile pins/popups. Native settings were rendered from WordPress and inspected at desktop/mobile widths; repeaters, per-URL role controls, Basic Auth fields, clipboard fallback, and diagnostics passed without saving client settings.
- Real WordPress REST dispatch passes for issue reads, denied anonymous network exchanges, authorized activity, and administrator-only logs. Existing feedback/event cursor is unchanged; local `wp feedbackpress sync-log` works and no feedback sync cron is scheduled. JSON update registration/parity and update-AJAX boot pass for 0.2.0. Existing screenshot/pin/shortcut/status-order regressions pass. Escape also clears the tooltip created when focus returns to the launcher.
- PHP/JavaScript syntax and archive integrity pass. Remote SiteDistrict firewall/basic-auth integration awaits a second deployed installation; HTTP errors and credentials were exercised through intercepted transport. Safari/Firefox and a production plugin upgrade were not exercised. Earlier multi-site sync compatibility was intentionally omitted.

## 0.2.1 connection-first administration

- WordPress-rendered settings inspected at 1440px and 390px: primary copy/paste connection flow, one flat site list with one type selector per URL, no network-name input, no Sync button, collapsed secondary review/diagnostics/API/disconnect sections.
- `tests/admin-ui.cjs` checks copying, adding/removing a site, Basic Auth disclosure when type changes, join/reset form payloads, automatic checks, and mobile overflow using intercepted requests. No customer settings are saved.
- Asset version bumped for the redesigned markup so browsers do not reuse the old controller. Added-row keys no longer depend on secure-context crypto APIs. PHP/JS syntax and updater version parity pass.

## 0.2.2 portable authors

- Standalone authors tests cover email normalization, display-name resolution, fallback names, required guest email, private responses, author sync validation, arrival order, stale revisions, and causal conflict resolution. WordPress checks used an isolated temporary events table on Harrison; existing feedback was unchanged.
- Chrome author picker/add-person and name/email cookie flows pass at desktop/mobile sizes. Popup border and connector are absent; status icons and sidebar accents remain. Stable-list and shortcut checks pass. Changes live in Harrison’s real plugin checkout, with no symlink. Remote copies must be upgraded before exchanging the new author/person events.

Pin relocation checks: Chrome mouse/touch drag, reload persistence, click-to-open, Escape/touch cancellation, HTTP failure restoration, and no navigation when dropping over a link. Standalone reduction/sync tests cover causal target revisions, preserved number/status, and invalid coordinates. WordPress API move/stale-write checks used a temporary events table; existing Harrison feedback was unchanged. Original screenshots remain unchanged.

Passive startup regression: `tests/pin-startup.cjs` confirms guest pins appear with the sidebar closed and its request delayed, before identity entry, including saved targets revealed after the initial API response. Hidden/revealed targets redraw automatically. Existing passive-filter and drag checks pass; review-access gating is unchanged.

Title/description checks: new-issue title validation and hotkey submission, separate popup description, two-line sidebar title, small author beside number, and desktop/mobile rendering pass in Chrome. Search tests include title-only matches; sync tests preserve titles and reject overlong values. Existing notes keep their original descriptions. Real WordPress temporary-table checks verify title search and oversized-title rejection without changing Harrison feedback. Existing stable-list, passive-pin, and real screenshot-capture regressions pass.

Composer statuses: Chrome verifies four icons, default To do, selection highlighting, and creation with Review selected. Reduction/sync tests cover all four initial statuses and reject invalid values. WordPress validation checks reject unsupported initial statuses without writing feedback.

Issue #3 screenshot investigation: the local JPEG exists, matches its stored checksum/size, decodes at 2053×1264, and loads in the actual Harrison lightbox. The stored capture has displaced hero text. The bundled renderer replaces videos with canvases without retaining their positioning, making the background an in-flow flex item. `tests/video-capture.cjs` reproduces the displacement (live x=576.5, broken x=1910.5) and verifies the capture-clone fix (x=576.5), including normal screenshot upload. Real-renderer screenshot/pin regression checks pass. Original issue #3 data/file was not changed. Cross-origin video frames may still be unavailable to canvas.

Automatic migration registration: the isolated network harness copies actual options and event rows between test installations. New remote/local URLs, repeated database overwrites, older directory recovery, duplicate URL reconciliation, missing screenshot transfer, and lost registration responses pass without reconnect codes. Copy identity is stable on repeat boot, original identities are unchanged, and URL removals/invalid credentials still reject registration. Discovery of a configured remote works before its token hash is known. Existing Basic Auth, HTTP-error/backoff, log bounds, event/file synchronization, and no-cron checks remain covered. Real WordPress boot/REST dispatch retains Harrison's identity and directory, registers the new permission callback, and denies malformed anonymous registration with 403 without changing customer feedback. The migrated SiteDistrict staging installation was not updated or exercised in these checks.

Connection-code copying: `tests/copy-code.cjs` exercises the current WordPress-rendered settings in Chrome and WebKit with intercepted HTTP and clipboard implementations. A delayed server response preserves click-initiated clipboard authorization; success writes the full encoded code rather than retaining a prior URL. Blocked/unavailable clipboard access selects the code for manual copying. Legacy text-only clipboard access, reconnect buttons, disabled duplicate clicks, JSON/HTML errors, and invalid URL-as-code responses pass without unhandled rejections. No real system clipboard or remote site is touched by these checks. Invitation errors retain the remote HTTP failure and do not rotate connected credentials. Admin scripts use a file timestamp in the cache version so a refresh loads the corrected handler.

Numeric issue references: network checks preserve #1–#3, convert a prefixed issue to #4, allocate #5 on joined copies, and reconcile simultaneous offline #5 claims to #5/#6 on both peers without overwriting either issue. Repeat conversion adds no events; deleted numbers remain reserved, restored counters honor corrected labels, and a numeric-looking UUID fallback is never treated as an assigned number. Reduction checks cover reordered number corrections and skewed timestamps without changing edit dates or status revisions. Harrison's local `61F84166-1` was changed to #4 through an appended number event; #1–#3, original events, issue UUIDs, all comment data, statuses, attachment metadata, and dates were verified unchanged. No staging request was made during that repair.

Docked review/design pass: `tests/review-design.cjs` checks a 400px drawer touching the viewport's top/right/bottom, square corners, fixed tools and a scrolling list, hidden floating launchers during browsing, and mobile return/new-feedback paths. Chrome and WebKit pass at desktop, 390px, and 320px widths; coarse-pointer and blocked-font variants pass. The actual bundled Inter font loads in successful-font fixtures, and the widget remains isolated from a deliberately conflicting host theme. Form heights/radii, author controls, status-colored hovers, gray completed rows, comment authors, media lightboxes, unsent replies, empty/search/error/retry states, and compact composers are covered. Fractional popup measurements prevent WebKit bottom-edge clipping. Visible text/placeholder contrast exceeds 4.5:1 and field borders exceed 3:1 on neutral surfaces. Keyboard shortcuts, passive pins, activity updates, owned comment edits, stable status-change positions, and instant tooltip regressions pass. WordPress enqueues matching JS/CSS cache versions and includes the local font/license without changing customer feedback. These checks use intercepted browser fixtures; staging was not deployed.

Own-comment editing: standalone reduction/sync tests cover out-of-order edits, timestamps, conflict detection/resolution, unchanged comment IDs/media associations, and no duplicate replies. WordPress temporary-table checks cover same-author saves, other-author 403s, logged-in identity precedence over supplied email, and stale revision rejection; customer feedback is unchanged. Chrome checks cover own-only Edit actions, original title/body and reply editing, Cancel/Escape/Ctrl+Enter, preserved unsent replies, HTTP failure/stale draft preservation, explicit latest-version reload, and remembered guest identity. Author picker and stable-row regression checks pass.

Settings spacing: the current WordPress-rendered fixture now includes native core buttons/common/forms CSS. Desktop and 390px checks confirm a centered column, at least 20px between Add site and the following divider, no horizontal overflow, and no Open site feedback link. Compact connection controls, add/remove rows, Basic Auth disclosure, copy/paste fallback, join/reset form payloads, and save behavior pass through intercepted HTTP and clipboard APIs without changing client settings. The admin stylesheet uses a file timestamp in its cache version.

Full-bleed list/navigation: `tests/list-navigation.cjs` uses 130 mock issues and real multi-document navigation in Chrome and WebKit. It verifies edge-to-edge rows, independent scrolling, and identical pixel offset/first visible issue after cross-page issue selection, ordinary site links, reload/Back, close/reopen, and mobile popup return. Search, status choices, sort, and list page persist. Delayed CSS/data cannot overwrite the saved scroll with an empty range; explicit view changes reset scroll. Status-position and overall review design checks pass. Requests remain intercepted, with no customer feedback changes.

Feedback toggle/launcher stability: reproduced an 11px upward movement when the placement notice appeared. Bottom-aligned toolbar items keep both launcher rectangles identical with the notice present, absent, or wrapping. Keyboard checks cover C entering/exiting placement and drafts, desktop/mobile geometry, repeat/modifier/editable guards, preserved native typing, and normal page clicks after exit. The pointer-based Leave feedback action keeps its existing behavior. No client feedback is changed by the fixtures.
