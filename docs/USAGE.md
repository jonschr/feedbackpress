# FeedbackPress usage

The current central-service beta is documented in [Central service testing](CENTRAL-TESTING.md). It replaces the peer-sync backend; old shared-key and peer endpoints are no longer active.


The Issues list has separate page scope, grouping, and order controls. All pages includes the complete project list; Current page limits it to the exact current address, including query parameters. Choose Flat list or By page independently, then Created, Last edited, or Completed with oldest/newest first. Defaults are All pages, Flat list, Created: oldest first. Page groups retain alphabetical URL order and sort their issues by the chosen chronology. Issues without a completion date appear last in either completion direction. Status filters remain independent; enable Done when reviewing completed issues.

These choices persist in the browser tab across navigation. Current page follows the page you navigate to. Explicit view changes reset the list to the top; status changes and replies retain the active list order and position until the next explicit view change or reload.

Issue rows show reply counts when there are shared replies. A compact attachment strip previews up to three thread uploads, excluding automatic screenshots, with +N for additional files. Click the row to open the full thread and its attachments. PDF/unavailable uploads use file markers; image previews load as rows become visible.


Open **Sidebar settings** at the bottom of the list to choose **Left** or **Right**, and **Overlay page** or **Make room**. Make room narrows the page beside the desktop sidebar; overlay keeps normal page width. These choices follow navigation within the tab. Fixed elements, viewport-sized sections and responsive breakpoints still use the real browser viewport. On narrow screens the controls retain your desktop choices, and the list/page use separate views.

**C** starts placing feedback without closing an open desktop list. Press C again outside a field to cancel placement/drafting and keep the list. On a narrow screen C returns from placement to the list. **Escape** closes review.
