# FeedbackPress usage

For clients reviewing a gated live site without a WordPress login, see [Client review links](REVIEW-LINKS.md). Review links grant shared feedback access only; private notes still require WordPress login.

The current central-service beta is documented in [Central service testing](CENTRAL-TESTING.md). It replaces the peer-sync backend; old shared-key and peer endpoints are no longer active.


The Issues list has one page-view menu: **All issues by page** divides the complete project list into dark page headers, **All issues listed** shows one flat list, and **Current page** limits it to the exact current address, including query parameters. Status filtering is beside it. The sort-arrow icon in the header offers Created, Last edited, or Completed with oldest/newest first; its tooltip shows the current order. Defaults are All issues listed and Created: oldest first. Page groups retain alphabetical URL order and sort their issues by the chosen chronology. Issues without a completion date appear last in either completion direction. Status filters remain independent; enable Done when reviewing completed issues.

These choices persist in the browser tab across navigation. Current page follows the page you navigate to. Explicit view changes reset the list to the top; status changes and replies retain the active list order and position until the next explicit view change or reload.

Issue rows show reply counts when there are shared replies. A compact attachment strip previews up to three thread uploads, excluding automatic screenshots, with +N for additional files. Click a thumbnail to open that image/PDF directly in the lightbox without opening or navigating to its issue. Use the download icon beside a sidebar thumbnail, Download under a thread attachment/screenshot, or Download in the lightbox for a one-click file save. Click the issue title/reply count or +N to open the full thread. PDF/unavailable uploads use file markers; image previews load as rows become visible.


Use the four icons at the bottom of the list to choose **Left** or **Right**, and **Overlay page** or **Make room**. Hover or keyboard-focus an icon for its tooltip; the active choices are highlighted. Make room proportionally scales the whole page beside the desktop sidebar, including the admin bar and fixed headers. FeedbackPress stays full size, and the site keeps its normal line wrapping and responsive breakpoints. Overlay keeps the page at normal size. These choices follow navigation within the tab. On narrow screens the controls retain your desktop choices, and the list/page use separate views.

**C** starts placing feedback without closing an open desktop list. Press C again outside a field to cancel placement/drafting and keep the list. On a narrow screen C returns from placement to the list. **Escape** closes review.

Open the three-dot button next to **your** issue, reply, or private note for **Edit**, **Make private / Make public**, or **Delete**. These owner actions require a logged-in WordPress user with the matching email and project access. Making an issue private protects its whole thread and attachments; publishing it does not publish separately private replies/notes. Publish a private parent issue before sharing a child note. Publication and deletion show a short scope confirmation. Delete removes the item from review and retains a protected recoverable record; it does not delete other authors' individual notes or immediately erase stored files. Private edits/drafts and pending uploads stay in memory only, so keep the page open until they finish.

Shared replies and your private human/agent notes appear together in posting order, oldest first. Editing or making a note public preserves its original position. Today’s posts show relative times (seconds/minutes/hours ago); earlier local calendar days show a short date and time without the year. Hover the time for the exact timestamp. Visible times refresh locally without replacing the thread or disturbing drafts.

Rapid review: shared/private writes use a per-project one-minute allowance of 600 changes per logged-in WordPress user, or 120 per guest IP. Background snapshots and ordinary reads do not use it. A limit response shows remaining seconds and Retry-After; failed edits remain available for deliberate Retry. Background errors are not proof that an issue was deleted. Missing feedback and missing attachments have separate messages.


The × on a failed background notification dismisses that message. Shared unsaved text/files remain recoverable: use the **notification-history icon** (with its count) at the bottom of the sidebar, then use **Retry** or **Restore draft**. Dismissal does not retry or override a stale revision. Private failed notes are recoverable only while that page remains open; they are never stored in the browser's persistent work queue.
