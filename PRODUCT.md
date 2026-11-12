# FeedbackPress

## Product
Self-hosted WordPress visual client feedback for website development and ongoing administrative review.

## Platform (current implementation)
Web: WordPress plugin, PHP 8.1+, vanilla JavaScript with Shadow DOM, local screenshot renderer. No frontend build step. Independent hosted API and account licensing.

## Confirmed workflow
Named visitors select elements or comment on a whole page. Issues start To do; Doing tracks active work; Review requests client approval/input; Done records verified fixes. Agents may update statuses and add replies through REST. Default view includes To do, Information needed and Review. Images and PDFs supported; video excluded.

Everyone mode exposes feedback to visitors. Administrators-only mode protects production review. Anyone with review access may change statuses. Administrators connect an account once and use a searchable project selector. Central site membership supports removal/reconnection; copies detect their actual home URL and preserve known destination project assignments. No local/remote role settings or copy/paste connection codes. Shared feedback and media are authoritative in the central service. Active review checks at most once per 60 seconds per installation, pauses idle/hidden, and uses no recurring sync cron. Bounded local diagnostics show HTTP results. Relative issue URLs support environment portability.

Review navigation defaults to all pages, a flat list, and creation order oldest first. Page scope (All pages / Current page), grouping (Flat list / By page), and chronological order are independent. The sidebar is a minimal list with selected highlighting and all five one-click status icons aligned beside the issue number; the current status is highlighted instead of written out. Discussion, replies, and files live in the pin popup, which also provides status icon actions and previous/next navigation.

Up/Down navigate the current issue list. Status keys 1–5 act on the issue most recently used by mouse movement or keyboard navigation, so a stationary pointer cannot change a second issue. Hover shortcuts also work on passive pins without opening the conversation; typing fields retain their normal keys.

Issue search covers original text and every reply within the selected statuses. Lists sort oldest or newest first by creation time, current completion date, or last activity (creation, reply, status, upload). Missing completion dates appear last in either direction. Page groups retain alphabetical URL order, with the chosen chronological order inside each group. Search, scope, grouping, order, and status selections persist across navigation. Current-page scope follows the exact current path/query and excludes other pages from its list and counts.

An open review continues across site pages using a short-lived shared browser snapshot: restore the same rows, selected issue, list/thread scroll and view before revalidating. Continuing review skips the drawer's entrance animation. The underlying site keeps its normal page navigation.

## Approved direction: independent central service

The [central service implementation plan](docs/CENTRAL-SERVICE-PLAN.md) is the durable contract for the replacement architecture. No legacy compatibility layer is required.

FeedbackPress will use its own API, PostgreSQL database, private media area, credentials, deployments, and backups on the existing Hetzner machine, independently of Sunrise. WordPress remains the interface and authorized gateway; shared feedback writes go to the service. Local, staging, and production copies connect to the same project through centrally managed URL memberships, without peer sync.

Lemon Squeezy licensing supports the proposed $30/month account with unlimited projects/commenters, multiple copies per project, 60-day media retention, and an account storage cap still to be chosen. No Clerk or general commenter accounts are required. Private agent notes sync centrally and require project access plus a logged-in WordPress user whose server-resolved email matches the operator email recorded on the note. Connected-site administrators are trusted for this identity; guest attribution never authorizes private access. Separate email verification is not required. Resend is reserved for future mention/change notifications with matching visibility rules. An owner may explicitly Convert to shared note: publish it under their human name while preserving body/time and protected original attribution. Unconverted notes and existing private human notes remain private. Shared statuses and explicit public replies remain project-visible.

Information needed follows To do in every status control. It uses a question-circle SVG and a teal semantic palette (ink #15675f, fill #ddf3ef, accent #2e9084). Shortcuts: 1 To do, 2 Information needed, 3 Doing, 4 Review, 5 Done. Status-filter options show matching shared issue totals across all pages, independent of which status checkboxes are enabled. Counts respect search, exclude private notes, and update with optimistic status changes. At narrow widths the popup navigation wraps instead of squeezing five icons.

While a floating issue conversation is open, N opens the next issue and P the previous issue, following the same list/order/pagination/page rules as Up/Down. These keys ignore fields/editors, modifiers, repeats, composition, filter menus and media dialogs. P still chooses whole-page feedback while placing a new pin. Previous/next tooltips and aria-keyshortcuts expose both letter and arrow bindings.

The issue list shows nonzero shared reply counts and a compact preview of thread uploads, excluding automatic screenshots. Show at most three tiny previews plus an additional-file count; clicking the summary opens the issue. Image reads are lazy and bounded, and never block issue interactions.


Image drops: the open issue card and sidebar issue rows accept PNG/JPEG/WebP files, 5 MiB each, as shared attachment-only replies. While hovering, use a neutral inset dashed outline and a washed white overlay with an image SVG, target issue reference, shared visibility and file limit. Invalid/private/pending states clearly block the drop. Preserve text drafts and list/navigation position. Files from one drop and consecutive drops onto the same issue join one image reply, including after earlier uploads complete; a text reply, another issue or closing review ends that group. Existing background cards show upload/retry state; never block navigation or turn a private draft into a shared reply. The normal attachment picker also permits image/PDF replies without captions, retaining a keyboard-accessible alternative.


Notification link destination is a project-wide native select under Sites in this project. Default Automatic uses the first connected public HTTPS site, preserving original connection order through heartbeats/reconnection. Explicit staging/production choices override it. Show the effective URL in wrapping helper text, include only DNS/IP-eligible options, and retain an unavailable explicit selection as a disabled option with a clear recovery message. Save link destination persists the central override; selecting Automatic clears it. Local-only projects get an actionable public-copy explanation. Choosing a destination does not enable deferred email delivery.
