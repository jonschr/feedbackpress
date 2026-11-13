# FeedbackPress usage

For clients reviewing a gated live site without a WordPress login, see [Client review links](REVIEW-LINKS.md). Review links grant shared feedback access only; private notes still require WordPress login.

The current central-service beta is documented in [Central service testing](CENTRAL-TESTING.md). It replaces the peer-sync backend; old shared-key and peer endpoints are no longer active.


The Issues list has one page-view menu: **Issues by page** divides the complete project list into dark page headers, **Issues list** shows one flat list, and **Current page** limits it to the exact current address, including query parameters. Status filtering is beside it. The sort-arrow icon in the header offers Created, Last edited, or Completed with oldest/newest first; its tooltip shows the current order. Defaults are Issues list and Created: oldest first. Page groups retain alphabetical URL order and sort their issues by the chosen chronology. Issues without a completion date appear last in either completion direction. Status filters remain independent; enable Done when reviewing completed issues.

These choices persist in the browser tab across navigation. Current page follows the page you navigate to. Explicit view changes reset the list to the top; status changes and replies retain the active list order and position until the next explicit view change or reload.

Issue rows show reply counts when there are shared replies. A compact attachment strip previews up to three thread uploads, excluding automatic screenshots, with +N for additional files. Click a thumbnail to open that image/PDF directly in the lightbox without opening or navigating to its issue. For a one-click file save, use Download in the lightbox or the download icon on a thread attachment/screenshot. Sidebar thumbnails have no separate download button. Click the issue title/reply count or +N to open the full thread. PDF/unavailable uploads use file markers; image previews load as rows become visible.


Use the four icons at the bottom of the list to choose **Left** or **Right**, and **Overlay page** or **Make room**. Hover or keyboard-focus an icon for its tooltip; the active choices are highlighted. Make room proportionally scales the whole page beside the desktop sidebar, including the admin bar and fixed headers. FeedbackPress stays full size, and the site keeps its normal line wrapping and responsive breakpoints. Overlay keeps the page at normal size. These choices follow navigation within the tab. On narrow screens the controls retain your desktop choices, and the list/page use separate views.

**C** starts placing feedback without closing an open desktop list. Press C again outside a field to cancel placement/drafting and keep the list. On a narrow screen C returns from placement to the list. **Escape** closes review.

Open the three-dot button next to **your** issue, reply, or private note for **Edit**, **Make private / Make public**, or **Delete**. These owner actions require a logged-in WordPress user with the matching email and project access. Making an issue private protects its whole thread and attachments; publishing it does not publish separately private replies/notes. Publish a private parent issue before sharing a child note. Publication and deletion show a short scope confirmation. Delete removes the item from review and retains a protected recoverable record; it does not delete other authors' individual notes or immediately erase stored files. Private edits/drafts and pending uploads stay in memory only, so keep the page open until they finish.

Shared replies and your private human/agent notes appear together in posting order, oldest first. Editing or making a note public preserves its original position. Today’s posts show relative times (seconds/minutes/hours ago); earlier local calendar days show a short date and time without the year. Hover the time for the exact timestamp. Visible times refresh locally without replacing the thread or disturbing drafts.

Rapid review: shared/private writes use a per-project one-minute allowance of 600 changes per logged-in WordPress user, or 120 per guest IP. Background snapshots and ordinary reads do not use it. A limit response shows remaining seconds and Retry-After; failed edits remain available for deliberate Retry. Background errors are not proof that an issue was deleted. Missing feedback and missing attachments have separate messages.


The × on a failed background notification dismisses that message. Shared unsaved text/files remain recoverable: use the **notification-history icon** (with its count) at the bottom of the sidebar, then use **Retry** or **Restore draft**. Dismissal does not retry or override a stale revision. Private failed notes are recoverable only while that page remains open; they are never stored in the browser's persistent work queue.


New sessions start with the sidebar on the right and Scale page to fit selected. Existing saved preferences take precedence; select the fit icon to change an older Overlay session.

### Responsive review in 0.3.0

Scale page to fit remains the default on the right. Cached shared issues open immediately; replies, edits, status changes and attachments show pending progress while the service saves them. Rapid unsent status changes on the same issue combine into the final choice. Already sent requests retain their revision checks and retry keys. A server cooldown delays queued requests; it does not freeze the interface.

Selecting another issue on the same page scrolls smoothly without reloading the document. Reduced-motion preferences skip the animation. Scrolling the page manually takes over immediately. Cross-page navigation still loads the destination WordPress page.

The existing WordPress update feed offers normal release 0.3.0 to legacy and central copies. A legacy copy needs an account key and a selected/new central project after updating. Old local feedback remains untouched and is not imported.

### Issue card controls

The card puts statuses on the left and navigation, the issue owner’s action menu and Close on the right. The issue number appears beside its author/date, below its title and description. Reply and private-note menus apply to their own notes; the header menu applies to the whole issue.

URLs in issue descriptions, replies and private notes render as gray underlined links. HTTP/HTTPS and www links open in a new tab, keeping the feedback conversation open. Editing preserves the original text.

Click an attachment image to open the lightbox. Hover or keyboard-focus its tile to replace the caption with a download icon; clicking that icon downloads the file directly. Touch screens always show the download icon. The reply field contains its paperclip, Private note toggle and Reply button in one bottom toolbar. A full-width divider separates the composer from the conversation. Only the thread scrolls; the header controls and reply input stay visible.

Issue rows stay white. The colored left rail holds the issue number and compact reply count. Titles appear above the author, with attachments in a separate strip; status controls appear on hover or keyboard focus, and stay visible on touch screens. The active status icon uses its matching soft color fill without a dot, while keyboard focus has a separate outline. Hovering or selecting an issue reverses the colors in its left rail, with a short transition; the row body stays white. The same five icons and short status-name tooltips appear in the list, card and creation form.

The sidebar header shows overall open and closed issue totals for the project you can access. Done counts as closed; To do, Information needed, Doing and Review count as open. Search, page scope and status filters change the list without changing these totals. Completing/reopening an issue updates the header immediately; private original issues count only for their authorized owner.

In Settings → FeedbackPress, enter your license or account access key in the visible text field (including TextExpander). It clears after connecting; the connected page keeps key entry under Account connection. Project selection and Review access are the main sections. Notification links sit under Connected sites; disconnect is under Account connection.
