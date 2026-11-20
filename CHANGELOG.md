# Changelog

## 0.5.0 — November 20, 2026

- Add centered page-note markers and a contextual ADD PAGE NOTE drop area, with click creation, drag conversion in both directions and a ticket-menu action. Page-note screenshots omit positional pins.
- Adapt the drop area to light, dark and image backgrounds; keep it clear of open tickets where space permits and switch to a square placement cursor over it.
- Edit owned titles, descriptions, replies and private notes by double-clicking. Inline fields fit their content, Escape cancels the field, and clicking elsewhere in the ticket saves. Menu-based editing remains available.
- Replace the status dropdown with a persistent, open-by-default icon drawer. Keep its summary width stable and automatically include Done when sorting by completion.
- Show Closed timestamps opposite the original author, using the existing human-readable time format.
- Toggle an active sidebar issue off with a second click, preserving the sidebar and drafts.
- Add circular author avatars, private-note colors and current-author markers; use bundled transparent Codex/Claude marks for agent notes.
- Change individual reply attribution through the author picker without changing immutable ownership.
- Restore saved sidebar spacing before page paint, preload review assets after access checking starts, and load screenshot support only when needed.
- Shorten displayed homepage URLs and remove move-handle tooltip/hover decoration while retaining dragging and keyboard access.

Known limitation: the strict Chrome first-open timing target remains intermittent on the release Mac; the published 0.4.1 comparison also missed it. See release verification for measured samples.

## 0.4.1 — November 19, 2026

- Refresh expired anonymous REST nonces once without requiring sign-in, and keep central review-access validation out of page rendering.

- Restore docked issue visibility on every selection, including same-page switches and reselecting the current issue, until the next actual hover exit.

## 0.4.0 — November 18, 2026

- Verify guest email before the first contribution, retain pending replies and attachments while checking email, and remember verified reviewers for 180 days. Native WordPress login bypasses verification and remains required for private notes.
- Resolve identity through an uncached access check in every review mode, keeping cached page HTML free of verified guest attribution. Authorized WordPress login takes precedence over stale sharing links.
- Require verified ownership when editing guest comments; supplied email addresses and attribution cookies cannot grant editing access.
- Preserve authorized WordPress CLI and Application Password writes while retaining browser nonce, origin, project and actor checks.
- Remove obsolete peer-conflict presentation and scope attachment binary output to FeedbackPress routes. Add WordPress security and full coding-standard review profiles.

- Use persistent public-environment links for copied sharing, invitations and notifications, with project-wide revocation that also ends guest sessions.
- Optionally create a FeedbackPress-only WordPress account when an invitation is first opened; reuse existing email-matched accounts without changing their roles or passwords, and preserve their comment identity after login.

- Open magic invitations directly in feedback, with login offered only through the on-site identity prompt and a return URL preserving the page and selected ticket.

- Accept a valid magic environment link when the destination installation holds a different active credential for the same site and project, using scoped service validation before starting the guest session.

- Remember docking across issue changes, page navigation, reloads and new tabs until explicitly changed.

- Dock issue windows flush to the sidebar and hide them completely when idle, restoring readability on hover or keyboard interaction.

- Remove the invite field’s baseline gap, keep recipient suggestions aligned after loading, and distinguish the picker with a raised dark surface and clear edge.

## 0.3.11 — November 18, 2026

- Add an owner-only Environments switcher in the sidebar for opening other connected project sites through their own magic review links.
- Move email invitations and magic-link copying from settings into a compact sidebar share bar, with existing-user email suggestions, independent copying and safe retries.

- Give the invite bar equal padding and a themed, keyboard/touch-accessible name-and-email picker.

Known limitation: intermittent Chrome first-open latency remains unresolved, as documented in 0.3.10.

## 0.3.10 — November 18, 2026

Known limitation: the strict Chrome first-open timing check remains intermittent on the release Mac. Final runs measured about 1.5–2.5 seconds; the published 0.3.9 comparison also missed the 100ms target. Browser correctness checks pass, but universal instantaneous first-open performance is not claimed.

- Align sidebar page titles and inline URLs, move disclosure chevrons to the right, and make the rest of each header toggle its group with a short reversible animation and reduced-motion support.
- Keep sidebar and conversation scrolling independent of theme smooth-scroll handlers, including Lenis, without disabling smooth scrolling on the page.
- Delete tickets and responses immediately from their action menus or keyboard shortcuts, retaining ownership/revision checks, duplicate-request protection and next-ticket focus.
- Add prepared email invitations alongside Copy magic link in WordPress settings. Email uses the central Resend transport, scoped retries and the existing review grant.
- Choose existing site users by their login email or enter a custom invitation address. Explain FeedbackPress briefly, offer login and guest access, open the issues sidebar, and make accepted invitees mentionable without subscribing them to unrelated tickets.
- Give agents a direct-ticket magic-link tool through MCP/Abilities, REST and WP-CLI, and instruct them to use those links when referencing shared tickets in chat.

- Support text changes on links styled as buttons and nested plain-text labels. Select the whole label from padding, place the caret from character clicks, suppress link activation while editing, and preserve icons and link attributes.

- Drag issue windows by their header independently of markers, or dock them beside either sidebar side. Preserve drafts, clamp positions to the viewport, support keyboard/touch movement and reset positions on reload.

- Include readable private human/agent notes in sidebar reply totals, scoped to the current WordPress user. Refresh private counts independently, update after note changes/conversion, and keep them out of shared browser caches.

- Refresh shared statuses and replies every 30 seconds in visible tabs, including idle tabs. Pause checks in hidden tabs, preserve drafts and pending changes, respect rate-limit backoff, and skip full snapshots when the service reports no changes.

- Add read-only agent guidance through WordPress MCP/Abilities, REST and WP-CLI: brief notes, human-bound privacy, dedicated-agent public replies, status criteria and text-change workflow.

- Open FeedbackPress settings after an unconfigured administrator activates the plugin. Show a concise licensing/setup notice until an account is connected, without redirecting connected installations or interrupting bulk/network/CLI activation.

## 0.3.9 — November 17, 2026

- Match the identity prompt gap to the launcher-button gaps and remove excess visual space above its heading.
- Add administrator-only Copy magic link actions for shared issues in card/sidebar menus, targeting the exact issue and page. Prefer site login in the identity prompt, with guest name/email as an alternative; preserve native WordPress identity when a review link is present.
- Let magic-link visitors read issues and view attachments without entering their name/email. Prompt when replying or creating feedback, preserve reply drafts/files when cancelled, and retain identity checks for other changes.

## 0.3.8 — November 17, 2026

- Capture automatic screenshots at the page's normal scale while the sidebar is open, without blank sidebar space. Preserve the clicked location, fixed headers and the live page's scale and scroll position.

## 0.3.7 — November 17, 2026

- Add account-owner controls to pause or resume new client tickets across a project. Existing client replies, attachments and ticket permissions remain available.
- Verify ownership with the original subscription/account key, rather than granting every WordPress administrator owner access. Owners can still create issues, and agent/private notes keep working.
- Show paused creation controls without discarding drafts. Pausing is off by default. Existing owners can reconnect with their original key once to verify ownership.

## 0.3.6 — November 16, 2026

- Preserve the issue sidebar across ordinary page navigation without automatically reopening the last selected ticket.
- Continue opening tickets for explicit issue links, cross-page issue selection and copied issue URLs; preserve cached rows and list/thread positions.

## 0.3.5 — November 16, 2026

- Add a project owner email setting for shared-feedback summaries after ten minutes without new client comments. New projects default to their creator’s WordPress administrator email.
- Use durable central batching, exclude the owner’s own comments and all private feedback, and fold owner mentions into the digest.
- Preserve existing notification-link selection, project access and connections. A compatible central service supplies delivery and safe retries.

## 0.3.4 — November 16, 2026

- Add Note / Text change selection, in-place plain-text suggestions, original/proposed comparison, safe preview and copy, and owner revision-based suggestion editing.
- Show stacked original/replacement rows for text of up to 10 words, and a single inline red/green diff for longer text. Highlight only changed words on the page; Copy returns the full plain replacement.
- Add Change text / T direct editing, a synchronized Change text to field and one global highlighted-preview switch. Retain C selection shortcuts and safe original restoration.
- Keep suggestion cards clear of their source text and center Copy in short replacement rows.
- Update the URL for same-page issue navigation, preserving query parameters and direct links.
- Show thumbnail loading/decoding states without layout shifts, with reduced-motion support.
- Keep background activity and identity prompts clear of the three launcher buttons on narrow screens.
- Add system-following light/dark appearance with a manual sidebar control.
- Add free one-project onboarding with 100 MB attachments and an account-bound sandbox upgrade to unlimited projects for $30/month, retaining the same key.
- Keep WordPress content application separate; live paid activation and public signup await their documented acceptance gates.
- Known limitations: thumbnails still transfer original image bytes; server-side resizing/variants are future work. The strict Chrome timing check still has occasional over-100ms paint results (132ms in this release check); no universal latency guarantee is claimed.


## 0.3.3 — November 13, 2026

- Default new installations to administrator-only review access, with reusable review links retained.
- Simplify account-key setup, add the Plugins-page Settings link, and make project creation the primary action beside the existing-project picker.
- Default to Issues by page, with collapsible groups, relative page links and session folding preferences.
- Center the Issue N reference in the card header; put Leave feedback before View issues.
- Add the blue pin-style placement cursor and let card-content clicks reveal offscreen markers without replacing drafts.
- Add owner-only Backspace/Enter and Cmd/Ctrl+Backspace deletion, preserving typing guards, revision checks and next-issue focus.


## 0.3.2 — November 13, 2026

- Make tooltips and shortcut badges pointer-transparent so they cannot keep themselves open after leaving a control. Preserve keyboard hints and adjacent-icon hover behavior.
- Swap status colors: To do is blue and Doing is amber, consistently across pins, sidebar rails, filters and card controls. Warnings retain their amber palette.
- Install the packaged release on local Harrison with physical plugin files, keeping the development checkout separate. Existing connection settings and central feedback remain unchanged.

## 0.3.1

- Refine the sidebar, conversation cards and WordPress connection screen with shared typography, controls and status colors.
- Add inline sidebar issue editing, visibility and deletion actions using existing owner permissions.
- Reveal newly posted replies/private notes and show subtle overflow cues in conversations and issue lists.
- Make thread URLs clickable, improve attachment previews/downloads and display lightweight privacy switches and shortcut badges.
- Preserve unchanged issue rows during selection and soften brief hover exits to avoid restarting control animations.
- Keep open menus stable during background refresh and store queued upload bytes reliably in Safari/WebKit, preserving navigation cancellation/resumption.
- Preserve all existing central feedback, attachments, connection settings and queued work. No data migration is required.
- Known limitation: the strict Chrome headless under-100ms benchmark remains slow on the release Mac, including the prior 0.3.0 code; the complete WebKit workflow passes at 23–31ms. Paid billing and notification delivery remain disabled pending the separately documented decisions/owner verification.

## 0.3.0 — November 12, 2026

- Normal release of the central-backed WordPress workflow. The existing update feed offers this normal release to legacy and central installations; legacy copies then connect to the central service through WordPress settings. Existing feedback stays untouched.
- Remove a page-fit resize feedback loop, batch geometry reads, reuse unchanged fit rules, cache anchor queries per DOM revision, and batch pin measurements. Cached selections keep the existing list DOM; optimistic status changes update controls without rebuilding the conversation.
- Restore controlled smooth same-page scrolling with reduced-motion support, cancellation on manual input, and bounded recovery from theme resets. Keep scroll protection across issue switches so native scroll snap cannot jump the page between them. Same-page issue selection does not navigate/reload.
- Serialize and pace background writes, combine only superseded unsent status changes, preserve frozen operation keys/revisions, and honor Retry-After. Private data remains memory-only and gateway actor checks remain authoritative.
- Strengthen the strict under-100ms benchmark with 200 issues, 600 content sections, fingerprinted anchors, theme-style noise and a paint boundary. Prior slow beta measurements remain historical; final release receipts record the measured scope/results.

This release does not enable live billing or deferred email delivery. Paid storage/grace/recovery decisions remain operational gates.

## 0.3.0-beta.7 — November 12, 2026

- Default new review sessions to a right sidebar with Scale page to fit. Preserve explicitly saved left/right and overlay/fit choices across navigation and reload.
- Avoid redundant native scroll writes while reconciling scaled layouts.
- Complete final frontend regressions for default scaling, scrolling, navigation, pins, screenshots and review controls. Stable automatic updates remain 0.2.2.

## 0.3.0-beta.6 — November 12, 2026

- Replace the expandable sidebar settings drawer with an always-visible compact icon bar. Two groups select left/right placement and overlay/scale-to-fit, with selected highlights, hover/focus tooltips, accessible names and native radio keyboard controls.
- Add a notification-history icon with a dismissed count and an icon for ending a client review session. Each action is directly available without opening a settings drawer. Mobile keeps saved desktop preferences disabled with contextual descriptions.
- Preserve exact list scroll, page scaling, pin dragging, screenshots, notification recovery and review-session access behavior. Stable automatic updates remain 0.2.2.

## 0.3.0-beta.5 — November 12, 2026

- Turn the misleading error cross into a real, keyboard-accessible Dismiss notification button. Dismissed shared errors stay hidden across navigation without losing unsaved text/files or retrying a write.
- Sidebar settings can show dismissed notifications again for Retry or Restore draft. Private work stays memory-only and is removed on identity change/page exit. Restore focus to a visible review control after dismissal.
- Verify stacked errors, click/Enter dismissal, navigation/reload, text/file/query/idempotency recovery, one upload and private persistence exclusion. Stable automatic updates remain 0.2.2.

## 0.3.0-beta.4 — November 12, 2026

- Make room now proportionally scales the whole page, including typography, the WordPress admin bar and fixed headers. The sidebar, pins and FeedbackPress controls stay full size.
- Preserve normal line wrapping, viewport-unit proportions and responsive breakpoints; fit either sidebar side without wrapping or reloading the site. Reconcile viewport-positioned boxes and dynamic layout changes, preserve the document scroll anchor, and restore original page styles when review closes or switches to mobile.
- Verify scaled pin placement/reveal/dragging, exact sidebar navigation state and screenshots using the bundled renderer. Stable automatic updates remain 0.2.2.

## 0.3.0-beta.3 — November 12, 2026

- Reveal issue pins with native element scrolling, bypassing theme window-scroll wrappers and temporarily controlling smooth scrolling, scroll snap and scroll anchoring.
- Correct delayed theme resets and layout shifts for a bounded 2.5–5 seconds. Account for fixed/sticky headers, scaled nested scroll panes, horizontal/RTL scrolling and saved-location fallback.
- Give manual page scrolling immediate control; sidebar/thread interaction stops correction while retaining snap protection. Restore prior styles on dismissal, navigation, hidden tabs or manual page input, preserving concurrent theme style edits.
- Tested on Secure AI Now with a controlled delayed scroll reset, plus intercepted navigation/layout/target/keyboard regressions. Fully virtual transform-driven scrolling engines may require a dedicated adapter; this beta does not claim universal control over arbitrary theme JavaScript.

Stable automatic updates remain 0.2.2; existing latency and production gates below are unchanged.

## 0.3.0-beta.2 — November 12, 2026

- Replace the shared 100-per-ten-minute write limit with fixed one-minute, per-project budgets: 600 changes per native WordPress user or 120 per guest IP. Background activity snapshots use read permission and consume no edit budget. Rejections return remaining seconds and Retry-After instead of extending a ten-minute lockout.
- Keep origin, nonce, native actor, ownership and project checks. Browser actor/forwarded-IP overrides cannot change the limiter identity.
- Preserve service error codes and distinguish missing issues/notes from missing files. Bounded lifecycle diagnostics record operation/status/code without feedback text, identities, tokens or IDs.
- Exercise issue deletion/retry/missing-item errors through the actual WordPress REST route on two isolated gateways. A reported historical delete failure has not been reproduced; no customer feedback/delete action was replayed.
- Limit dark page-header titles to one line with an ellipsis.

Known beta latency, email-verification and production gates below remain unchanged. Stable automatic updates remain 0.2.2.

## 0.3.0-beta.1 — November 12, 2026

This is a breaking beta of the central-backed FeedbackPress workflow. It requires a compatible FeedbackPress service and an account key. Existing peer-sync feedback stays untouched; this version does not import it or synchronize through the old peer protocol. The stable automatic-update channel remains at 0.2.2.

- Connect an account in WordPress, choose/create labeled projects, and see connected site copies.
- Shared central issues, replies and media with stable issue numbers, revision conflict checks and safe retries.
- Owner-private issues, replies and human/agent notes, with editing, explicit publication and recoverable deletion. Private access uses the matching logged-in WordPress email; review links grant shared access only.
- More resilient pins, preserved query parameters, continuous cross-page review, temporary shared caching and background save/upload progress. Navigation-aborted uploads stay resumable instead of retaining a transport error.
- Five statuses with counts and keys 1–5, mouse/keyboard target precedence, Up/Down and N/P issue navigation.
- Compact list/page/current-page views, six date sort orders, page titles and clickable muted page links; reply counts and attachment thumbnails.
- Direct sidebar attachment lightboxes, larger image/PDF previews, one-click downloads and multi-image drag/drop replies.
- Shared/private notes in original posting order, friendly local timestamps and equal visual hierarchy.
- Mention completion and project notification-destination selection. Email delivery remains capture-only pending owner verification.

Controlled pilot release. Live paid billing/customer production acceptance and final allowance/grace/recovery decisions remain separate gates. Media retention is 60 days. No automatic legacy-feedback import or deletion.

### Known beta limitations

The strict under-100ms cached-open benchmark failed on the release Mac (also reproduced with the earlier UI checkpoint). Prior runs were faster; this release does not claim a universal latency guarantee. A previously reported issue-count difference in already-open QA tabs remains unreproduced; fresh gateway inventories matched. Email verification and paid/customer production gates remain deferred.
