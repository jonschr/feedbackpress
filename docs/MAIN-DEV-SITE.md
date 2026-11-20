# FeedbackPress Main Dev

Created November 20, 2026 in Cove as `feedbackpress-main-dev`.

- Site: https://feedbackpress-main-dev.localhost:8453/
- WordPress: https://feedbackpress-main-dev.localhost:8453/wp-admin/
- WordPress root: `/Users/jonschroeder/Cove/Sites/feedbackpress-main-dev.localhost/public`
- Login: `cove login feedbackpress-main-dev` (native one-time administrator login; do not store a login URL here).
- Plugin: `wp-content/plugins/feedbackpress` is a symlink to the working plugin checkout, `/Users/jonschroeder/Local Sites/FeedbackPress Plugin`. Source edits appear here immediately; this is a development site, not an immutable release installation.
- Theme: `sunday-bread`, a local child of the Ollie theme copied from Cove's Blueprint site. Design tokens live in its `theme.json`; the six pages, navigation, header and footer use native WordPress blocks.

## Fictional client

Sunday Bread is a neighborhood bakery, operated by Maya and Owen Bell. Its Home, Menu, Our Story, Cakes & Catering, Journal and Visit pages are published, with 206 native page blocks and no Custom HTML fallback. The address, phone number and `.example` contacts are fictional; there are no live orders or enquiry submissions. Search indexing is discouraged.

The administrator uses the existing operator identity. Fictional reviewers `maya-bell` and `owen-bell` are subscribers. Use Cove's administrator login for development; no passwords are documented here.

## Feedback fixture

The site has its own **Sunday Bread — Main Dev** central project (`9ef5bc3b-1de0-4384-ab06-df3abcbee693`), separate from all customer and existing QA projects. It uses the existing owner account, without copying another project's feedback.

Initial inventory:

| Status | Tickets |
| --- | ---: |
| To do | 5 |
| Information needed | 4 |
| Doing | 3 |
| Review | 4 |
| Done | 3 |

There are 19 tickets including one private developer ticket, 24 replies, two text-change suggestions, two reference-photo attachments, one real homepage screenshot, and two private human notes. The owner sees all 19 tickets; anonymous reviewers see the 18 shared tickets. Default status filters hide Doing and Done until selected.

A few inconsistencies are deliberate review material: homepage/weekend hours, cake wording/lead time, non-clickable contact details, final address confirmation, and requested photo crops. Completed tickets correspond to the current corrected story year, Visit hours and native mobile navigation.

The project has no notification email or public notification destination. Do not add a public destination or real notification recipients as part of ordinary fixture resets.

## Retained assets

`/Users/jonschroeder/Cove/Sites/feedbackpress-main-dev.localhost/development-fixture` is outside the public web root. It holds page intent JSON, generated block markup and validity reports, photo sources/credits, page IDs, feedback seed and receipt, screenshots and verification receipts. Imported photos are in the WordPress media library. Feedback attachments use normal service storage and its 60-day retention.

The `sunday_fixture_*` WordPress options record the project and seed journal. Do not delete them or reseed into another project without inspecting the existing state. The initial seed used normal WordPress/plugin APIs, not direct database writes.

## Initial verification

Chrome checks pass for all six public pages, image loading, feedback targets/text-change originals, actual owner controls, drawer persistence across header-link navigation, opening a seeded ticket, and native mobile navigation at 390px/320px. All six pages open in the real WordPress editor as valid core blocks without recovery errors. Owner/anonymous inventory and private-note counts match the fixture. No browser page errors were observed; Safari/Firefox were not checked. Receipts: `browser-verification.json` and `inventory-verification.json` in the fixture directory.
