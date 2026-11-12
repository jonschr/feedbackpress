# FeedbackPress usage

For clients reviewing a gated live site without a WordPress login, see [Client review links](REVIEW-LINKS.md). Review links grant shared feedback access only; private notes still require WordPress login.

The current central-service beta is documented in [Central service testing](CENTRAL-TESTING.md). It replaces the peer-sync backend; old shared-key and peer endpoints are no longer active.


The Issues list has one page-view menu: **All issues by page** divides the complete project list into dark page headers, **All issues listed** shows one flat list, and **Current page** limits it to the exact current address, including query parameters. Status filtering is beside it. The sort-arrow icon in the header offers Created, Last edited, or Completed with oldest/newest first; its tooltip shows the current order. Defaults are All issues listed and Created: oldest first. Page groups retain alphabetical URL order and sort their issues by the chosen chronology. Issues without a completion date appear last in either completion direction. Status filters remain independent; enable Done when reviewing completed issues.

These choices persist in the browser tab across navigation. Current page follows the page you navigate to. Explicit view changes reset the list to the top; status changes and replies retain the active list order and position until the next explicit view change or reload.

Issue rows show reply counts when there are shared replies. A compact attachment strip previews up to three thread uploads, excluding automatic screenshots, with +N for additional files. Click the row to open the full thread and its attachments. PDF/unavailable uploads use file markers; image previews load as rows become visible.


Open **Sidebar settings** at the bottom of the list to choose **Left** or **Right**, and **Overlay page** or **Make room**. Make room narrows the page beside the desktop sidebar; overlay keeps normal page width. These choices follow navigation within the tab. Fixed elements, viewport-sized sections and responsive breakpoints still use the real browser viewport. On narrow screens the controls retain your desktop choices, and the list/page use separate views.

**C** starts placing feedback without closing an open desktop list. Press C again outside a field to cancel placement/drafting and keep the list. On a narrow screen C returns from placement to the list. **Escape** closes review.

Open the three-dot button next to **your** issue, reply, or private note for **Edit**, **Make private / Make public**, or **Delete**. These owner actions require a logged-in WordPress user with the matching email and project access. Making an issue private protects its whole thread and attachments; publishing it does not publish separately private replies/notes. Publish a private parent issue before sharing a child note. Publication and deletion show a short scope confirmation. Delete removes the item from review and retains a protected recoverable record; it does not delete other authors' individual notes or immediately erase stored files. Private edits/drafts and pending uploads stay in memory only, so keep the page open until they finish.
