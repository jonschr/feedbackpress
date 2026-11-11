# FeedbackPress

## Product
Self-hosted WordPress visual client feedback for website development and ongoing administrative review.

## Platform (current implementation)
Web: WordPress plugin, PHP 8.1+, vanilla JavaScript with Shadow DOM, local screenshot renderer. No frontend build step. Independent hosted API and account licensing.

## Confirmed workflow
Named visitors select elements or comment on a whole page. Issues start To do; Doing tracks active work; Review requests client approval/input; Done records verified fixes. Agents may update statuses and add replies through REST. Default view includes To do and Review. Images and PDFs supported; video excluded.

Everyone mode exposes feedback to visitors. Administrators-only mode protects production review. Anyone with review access may change statuses. Administrators connect an account once and use a searchable project selector. Central site membership supports removal/reconnection; copies detect their actual home URL and preserve known destination project assignments. No local/remote role settings or copy/paste connection codes. Shared feedback and media are authoritative in the central service. Active review checks at most once per 60 seconds per installation, pauses idle/hidden, and uses no recurring sync cron. Bounded local diagnostics show HTTP results. Relative issue URLs support environment portability.

Review navigation defaults to all pages sorted by numeric issue reference; page grouping is also available. The sidebar is a minimal list with selected highlighting and all four one-click status icons aligned beside the issue number; the current status is highlighted instead of written out. Discussion, replies, and files live in the pin popup, which also provides status icon actions and previous/next navigation.

Up/Down navigate the current issue list. Status keys 1–4 act on the issue most recently used by mouse movement or keyboard navigation, so a stationary pointer cannot change a second issue. Hover shortcuts also work on passive pins without opening the conversation; typing fields retain their normal keys.

Issue search covers original text and every reply within the selected statuses. Lists also sort newest first by current completion date or last activity (creation, reply, status, upload). Search, sorting, and status selections persist when navigating between pages.

An open review continues across site pages using a short-lived shared browser snapshot: restore the same rows, selected issue, list/thread scroll and view before revalidating. Continuing review skips the drawer's entrance animation. The underlying site keeps its normal page navigation.

## Approved direction: independent central service

The [central service implementation plan](docs/CENTRAL-SERVICE-PLAN.md) is the durable contract for the replacement architecture. No legacy compatibility layer is required.

FeedbackPress will use its own API, PostgreSQL database, private media area, credentials, deployments, and backups on the existing Hetzner machine, independently of Sunrise. WordPress remains the interface and authorized gateway; shared feedback writes go to the service. Local, staging, and production copies connect to the same project through centrally managed URL memberships, without peer sync.

Lemon Squeezy licensing supports the proposed $30/month account with unlimited projects/commenters, multiple copies per project, 60-day media retention, and an account storage cap still to be chosen. No Clerk or general commenter accounts are required. Private agent notes sync centrally and require project access plus a logged-in WordPress user whose server-resolved email matches the operator email recorded on the note. Connected-site administrators are trusted for this identity; guest attribution never authorizes private access. Separate email verification is not required. Resend is reserved for future mention/change notifications with matching visibility rules. An owner may explicitly Convert to shared note: publish it under their human name while preserving body/time and protected original attribution. Unconverted notes and existing private human notes remain private. Shared statuses and explicit public replies remain project-visible.
