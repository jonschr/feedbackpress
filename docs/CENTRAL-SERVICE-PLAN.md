# FeedbackPress central service implementation plan

Status: Phase 1 shared API prototype implemented and verified locally. Host operational gates remain; Phase 2 WordPress gateway integration is next. Updated November 11, 2026.

The canonical copy of this plan lives in `~/Local Sites/FeedbackPress Service/docs/CENTRAL-SERVICE-PLAN.md`, with matching documentation mirrors in the Harrison and Laurel plugin checkouts. This is the durable handoff for the next implementation sessions. Preserve the decisions here; record progress, evidence, and any changed decisions in the execution log at the end. A phase is complete only when its acceptance checks pass.

## 1. Outcome and fixed decisions

- One independent FeedbackPress service on the existing Hetzner machine is the authoritative store for issues, replies, statuses, authors, screenshots, attachments, and private agent notes.
- Share the physical server only. FeedbackPress has its own application/repository, database, database roles, Linux user, process, private configuration, file area, authentication secrets, releases, logs, and backups. Do not integrate with Sunrise's application, database, user directory, Clerk application, billing logic, or credentials. Only host-level routing/infrastructure is common. Plan a dedicated FeedbackPress PostgreSQL instance/cluster and service rather than sharing Sunrise's application database service; verify host capacity for that isolation first.
- Keep the native WordPress overlay, screenshot capture, pins, issue navigation, and agent workflow. WordPress is an authorized gateway to the service, not another authoritative feedback store.
- No peer-to-peer synchronization, recurring WordPress sync cron, local feedback writes, or offline edits that later compete with central data. A local site only needs outbound connectivity to the service; nobody needs to reach it from the Internet.
- No backward compatibility with the current implementation is required: no legacy peer protocol, old schemas, old REST payload compatibility, legacy settings conversion, or dual-write transition. Preserve useful user-facing behavior, not the old architecture.
- Lemon Squeezy handles sales/subscriptions through the existing store. Initial offer: $30/month per paying account, unlimited projects, unlimited commenters, multiple site URLs within each project. Final checkout/tax presentation is configured in Lemon Squeezy.
- No Clerk and no custom username/password customer portal in the first version. Owners manage projects through authenticated WordPress settings; Lemon Squeezy handles purchase receipts/license recovery and subscription management.
- Commenters need no service account. Existing WordPress review-access settings decide who can use shared feedback. Names/emails are attribution metadata, not proof of a service identity.
- Media retention is 60 days from successful upload, in UTC. An account-wide byte allowance is required; its amount is still to be decided. Expiring media does not delete issue text or replies.
- Agent notes sync centrally. Private notes require project access and a logged-in WordPress user whose server-resolved email matches the agent operator email recorded on the note. WordPress and connected-site administrators are trusted for this identity; the owner explicitly accepted that trust model. Guest attribution and browser-supplied email do not authorize private access. No separate email verification or service login is required.
- An owner who can read an agent note can convert it to their own note. Preserve privacy and original attribution in audit history; conversion is not publication.

## 2. What is known, and what remains unverified

Service repository: `~/Local Sites/FeedbackPress Service`, a separate real directory beside `Sunrise Control`. Local Git branch `main`; owner added remote `https://github.com/jonschr/FeedbackPress-Service.git`. No upstream is configured, so freshness was compared explicitly with `origin/main` (0 ahead / 0 behind before implementation). The service implementation and deployment templates belong here. Service source licensing remains undecided; do not publish releases implicitly.

WordPress plugin repository: `jonschr/feedbackpress`. Current source checkout: `~/Cove/Sites/harrison-jet-guns.localhost/public/wp-content/plugins/feedbackpress`; Laurel has a separate real checkout of the same repository. Preserve existing uncommitted work, including optional descriptions and list-navigation fixes.

Sunrise Control source inspected read-only at `~/Local Sites/Sunrise Control`. Its deployment records and units show Node, Caddy, PostgreSQL, separate service users, restricted auth/runtime database roles, health-checked releases, and daily database backups. These are reference patterns, not shared FeedbackPress services. Its current request handling buffers bodies and limits them to 2 MB; do not reuse that unchanged for 5 MiB media uploads. Its provisioning script rewrites Caddy configuration; do not rerun it on the existing server.

SSH access through the documented `sunrise` alias was restored and checked read-only on November 11, 2026 after the owner unlocked the existing key. Host `kvothe` has 2 logical CPUs, 1,926 MiB RAM with about 1,225 MiB available at inspection, no swap, and a 38 GB root filesystem with about 29 GB free. Load average was 0.12 / 0.10 / 0.05. This supports evaluating a small bounded pilot, not a peak-load or production-capacity guarantee. Confirm aggregate memory/connection/disk budgets before adding the dedicated database process and API.

PostgreSQL 18's existing main cluster listens on loopback port 5432; Caddy and both Sunrise environments were active. Other existing listeners include 8787, 8788, 8790 and 8080; preserve them. Caddy also serves `api.guest-key.com`, which must remain untouched. Existing Sunrise service definitions each allow 600 MiB, so maximum aggregate demand needs explicit budgeting on this 2 GB host. The two daily Sunrise backup timers showed successful recent runs; their local archives totaled roughly 69 MB and the PostgreSQL data area about 125 MB. Off-server automation, backup recoverability, and database connection headroom were not re-certified.

The owner selected `https://feedbackpress.elod.in` and provisioned its DNS. Public DNS resolves through Cloudflare; the origin A-record target is therefore not independently visible in public DNS. A single public HTTPS HEAD returned Cloudflare 525, and the host Caddy configuration has no FeedbackPress site/certificate yet. HTTPS is not ready; configure and verify the dedicated hostname during provisioning without changing existing hosts. No rate limit was observed.

No FeedbackPress application/database or other server resources have been provisioned by this work. Billing products and dedicated API keys were created later during access setup (see execution log and `docs/ACCESS.md`); an email credential is still pending. Server inspection was read-only.

## 3. Smallest architecture

```text
Reviewer browser -> WordPress FeedbackPress gateway -> FeedbackPress API
Local agent     -> WordPress WP-CLI gateway        -> FeedbackPress API
Remote agent    -> authenticated WordPress REST   -> FeedbackPress API
                                                      |
                           dedicated PostgreSQL + private file storage

Lemon Squeezy -> signed billing webhooks -> FeedbackPress entitlements
WordPress login -> server-resolved email -> private-note owner access
Resend (later) -> authorized mention/change notifications
```

The public review frontend never receives the account license, project service credential, Lemon Squeezy API secret, or server filesystem paths. Owners can enter a license only in the authenticated administration connection flow. The plugin performs its access check before forwarding requests; the service independently authorizes the project connection and entitlement. Hiding buttons is not authorization.

### Accounts, projects, and site copies

- A backend account has a generated ID, a billing/license association or explicit complimentary entitlement, and storage usage/allowance. Do not identify accounts solely by an email address.
- Validate the expected Lemon Squeezy store/product/variant and subscription association. Handle duplicate deliveries and repeated activation idempotently. Keep store API credentials only on the service.
- The owner initially supplies a license through WordPress administration to establish account-management access. Keep account-management authority out of public feedback routes.
- Each project has a stable ID, relative page paths, and central issue numbering. A project connection code provisions a revocable, project-limited credential for another copy. Project credentials cannot administer the account. Private operations additionally require the trusted WordPress gateway to supply the current authenticated actor; no actor is supplied for guests. Credential-holding gateways/administrators are trusted to attest that actor, not treated as independently verified email authorities.
- Project IDs and valid connection credentials intentionally travel with a site copy. A changed URL does not invalidate membership or require reconnection. URLs and Local/Remote labels are descriptive connection information, not identity credentials or a discovery mesh.
- Keep migration-sensitive project connection data encoded where appropriate. Do not embed credentials in URLs. Do not depend on migration-plugin hooks, hostname heuristics, or persistent installation-local identity files for shared project access.
- Copying an unrelated client's database can copy its project connection. Provide an explicit Disconnect / Start new project action; this is an owner decision, not an inference from a changed domain.
- All local/staging/production WordPress copies of a real project use the SAME production FeedbackPress project/API. A staging FeedbackPress backend is only for testing FeedbackPress itself, with isolated test data and billing configuration.

### Service and storage

Use one small TypeScript/Node application, a dedicated PostgreSQL instance/cluster with its own database and restricted roles, and a private writable data directory outside release folders and web roots. Keep media bytes out of PostgreSQL and the WordPress Media Library. Do not add Redis, a queue service, object storage, or another database platform without a demonstrated requirement.

Use separate metadata and bounded streaming upload routes. Initially retain support for images/PDFs and a 5 MiB per-file limit. Reserve account storage atomically before uploads; validate content type, size, checksum, and ownership before finalizing. Clean up abandoned uploads. Serve private media through authorized requests rather than exposing a directory. Preserve the distinction between automatic screenshots and comment attachments.

Enforce 60-day deletion with a service-side maintenance task, including thumbnails and any temporary copies. Keep an expired-file record for a clear UI explanation. Enforce an overall account cap; text feedback should still save when an upload is rejected for capacity. Explain screenshot/upload failures accurately without duplicating issues or replies on retry. Backups must have their own documented expiry so media does not remain indefinitely in archives.

### Consistency, speed, and active refresh

- Commit shared changes centrally and acknowledge only after durable success. Assign project issue numbers transactionally; normal service operation never renumbers existing issues.
- Use server revisions and conditional writes to reject stale edits. Use idempotency IDs for issue creation, replies, note conversion, and upload finalization. Store timestamps in UTC; use revisions/cursors, not client clocks, for ordering and catch-up.
- Save issue text independently of screenshot/upload completion. Show the pin immediately with pending/success/failure state. Never announce a failed remote write as saved.
- Start refreshing when an authorized reviewer lands on a page with the tools. Preserve the existing at-most-once-per-60-seconds installation catch-up limit as the initial polling baseline; coalesce requests and pause polling when idle/hidden. A successful local action updates its own UI immediately.
- If the pilot needs faster cross-copy updates, add one authenticated, active-only event stream with cursor catch-up and polling fallback. Any transport change must remain activity-driven; no permanent background site polling or WordPress cron.
- Shared responses contain only shared data. Private notes use separate authorized requests, responses, caches, and notifications. Never broadcast private note bodies or metadata to ordinary project subscribers.
- Preserve the full list, ordering, filters, pagination, and exact scroll position when selecting issues or navigating between pages. Shared status updates do not move the current rows until the user deliberately reloads/reorders/refilters.
- During outages retain explicit unsent browser drafts and retry controls. Do not introduce a second writable WordPress issue store. A persistent local read mirror is deferred until measurements justify it.

## 4. Agents and private notes

### Shared agent operations

Retain the capabilities to list/search/filter issues, read descriptions/replies/files, move a pin, change status, leave an explicitly public reply, and report results. Preserve Todo / Doing / Review / Done semantics. Agents may mark clearly verified work Done; uncertainty or required human approval goes to Review.

Provide WP-CLI commands for local agents and authenticated REST operations for remote agents. Resolve WordPress capabilities server-side; local network addresses alone do not confer authority. Normal remote access can use a WordPress Application Password. Hosting Basic Auth is a separate outer gate and may require a compatible transport or existing authenticated WordPress execution path.

The plugin uses its stored project credential internally. Do not require agents to extract or print secrets. An optional MCP adapter can wrap the same operations later; it must use the same authorization, not create a parallel permission system. Do not require an MCP server for the initial API/CLI workflow.

### Private operator identity

Use the authenticated WordPress user as the private-note identity. The plugin resolves the current user and email server-side after validating WordPress authentication, capabilities, project access, and nonce/Application Password as appropriate. Agents use an explicitly selected WordPress user in WP-CLI or the user authenticated by remote REST. No Clerk, separate service password, email OTP, or independent operator-token system is required for this version.

- Record normalized owner email and agent/run attribution when the note is created. The owner is derived from the authenticated WordPress actor, never guest attribution or an arbitrary email supplied by the agent/browser.
- The server-to-server gateway authenticates with its project credential and supplies the trusted actor context for each private operation. Strip/ignore client-supplied actor headers/body fields at the WordPress boundary. The service rechecks project scope and matches that actor email to the stored owner; a shared operation without actor context cannot return private notes.
- This deliberately trusts administrators and credential holders of every connected copy: they can change WordPress emails or attest another actor. The owner explicitly accepted this boundary for keeping routine agent conversations out of client views. Do not claim independent email ownership verification or add another identity service to compensate.
- Match emails conservatively and consistently across copies; do not merge plus aliases, dots or unrelated addresses. Changing a WordPress account's email changes its matching access; do not rewrite historical note ownership automatically. WordPress user IDs are installation-local and must not be central identities.
- Guests, including guests who enter the owner's email, cannot read private notes. A logged-in user with a different email also cannot read them. Matching an email does not grant project access on its own.
- Resolve the actor afresh on each request. Logout, user switching, changed email and project/WordPress permission revocation must end that user's access. Do not store private notes in shared WordPress caches/options, public responses, localized frontend state or guest-visible HTML.

### Note visibility and conversion

Make the API/tool distinction explicit: shared public reply versus private agent note. Agent notes default to private. Show authorized private notes with a distinct muted treatment and a Private agent note label in the issue UI. Other reviewers must receive no private-note data, not merely hidden HTML.

Offer Convert to my note only for an agent note owned by the current authenticated WordPress email. The central, idempotent conversion operation:

1. Rechecks ownership, project access, and current revision.
2. Changes the displayed author/kind from agent to the matching authenticated WordPress user.
3. Preserves issue association, body, original timestamp, and private visibility.
4. Records original agent/operator attribution, conversion actor/time, and subsequent edits in protected audit history.
5. Updates other authorized views through the private channel.

Conversion does not make a note client-visible. If publishing is desired, use an explicit separate public-reply action with a clear visibility choice. Do not automatically include private notes in public exports, searches, issue feeds, or shared agent replies. Private search/export must apply the same ownership checks.

## 5. Billing and account management

Use the existing Lemon Squeezy store with a dedicated FeedbackPress subscription product/variant and test mode for development. Receive verified signed webhooks; persist event IDs and authoritative provider state, handling retries and out-of-order events. Reconcile periodically and on relevant management actions, not once per comment or page load.

The service grants project read/write/upload capabilities from cached, current account entitlements. A transient Lemon Squeezy outage is not an instruction to erase data or instantly revoke a previously valid account. Cancellation and expiration differ: respect paid-through dates. Handle revocation/refunds according to the selected policy.

Support admin-issued complimentary accounts and explicit entitlement overrides without fabricating purchases or using email-based privileged backdoors. Keep broad account-management credentials separate from project review credentials. Billing links should use Lemon Squeezy's authenticated customer portal; do not create our own password reset/account recovery system.

### Transactional notifications (later scope)

Keep dedicated Resend access for future @mentions and substantive changes by other users. This is a delivery service, not an identity provider or a dependency for private-note access. Do not build mention/change notifications as an unrequested expansion of the initial private-note work. When implemented, define substantive-change batching/deduplication and user preferences, and apply issue/project visibility before choosing recipients. Private agent conversations must not leak through email bodies, subjects, previews, files or recipient lists; notification links retain the usual access checks. Intercept automated test delivery and send real messages only within an explicitly authorized delivery test.

## 6. Implementation phases and acceptance gates

### Phase 0 — prerequisites and isolated project setup

Read current Git state, fetch/compare before edits, and preserve pending plugin work. The separate local service repository now exists at `~/Local Sites/FeedbackPress Service`; retain its copy of this plan as the cross-repository contract. The owner has added/pushed the hosted Git remote. Confirm service source licensing before distributing a release. Local development can proceed with isolated billing test adapters and captured notification delivery while external setup is pending.

Before touching the server, restore authorized SSH access and inspect resource headroom, database connections, service limits, Caddy configuration, disk layout, and backups. Choose a dedicated HTTPS hostname. Plan separate Linux user, ports, PostgreSQL instance/database/roles, private configuration, writable storage and quotas, bounded logs, and resource limits. Host-level HTTPS routing must not grant access to Sunrise application services. Do not run Sunrise deployment/provisioning scripts against FeedbackPress or modify Sunrise application data.

Gate: local setup is reproducible; host capacity and isolation are documented before provisioning; secrets remain outside repositories/tool output. No service is deployed just to complete this planning phase.

### Phase 1 — central shared API and storage

Local implementation and automated acceptance coverage are in place (November 11). The prototype uses offline-issued complimentary/test entitlements with explicit storage caps; actual subscription validation is Phase 4. It has no connection to existing WordPress feedback yet. See `docs/API.md` and `docs/LOCAL-TESTING.md` in the service repository; the plugin checkouts mirror only this plan.

Implement account/project entitlements and credentials, issue/comment/status APIs, stable numbering, conditional writes/idempotency, relative targets/URLs, attachment reservation/upload/download/expiry, and a bounded change feed. Protect tenant boundaries in queries, constraints, and restricted database roles. Use disposable databases/files in tests.

Gate: account/project isolation, stale writes, duplicate retries, concurrent numbering, path portability, media authorization, 5 MiB limits, storage races, expiry, abandoned uploads, and failure recovery pass. Text creation succeeds with an explicit attachment failure when storage is full.

### Phase 2 — WordPress gateway and current UI

Replace local feedback storage and peer exchanges with the service adapter. Implement license connection, create/select project, copy/paste project connection code, disconnect/new-project controls, access-checked REST and WP-CLI gateways, and clear service errors. Remove obsolete environment peer lists, Basic Auth peer settings, migration-identity recovery, peer logs, local feedback writers, and sync cron hooks. Do not keep legacy compatibility shims.

Preserve existing interaction behavior: title with optional description, remembered attribution, pin placement/dragging/scrolling, filtered passive pins, status icons and shortcuts, inline media/lightboxes, screenshots with pins, replies/edits, search, ordering, and list/navigation position. Explain that legacy local data is not the connected service's source of truth.

Gate: two independent local WordPress copies use one test project; updates appear on both without inbound local connectivity; access/nonce checks and denied calls pass; the current UI/browser regressions pass. No feedback or attachment bytes are written into WordPress feedback tables/files by new shared operations.

### Phase 3 — WordPress-authenticated private notes and agent workflow

Implement trusted WordPress actor context, private-note CRUD, agent defaults, protected search/export/notifications, distinct UI, and Convert to my note. Exercise through WP-CLI with an explicit user and remote authenticated REST. No email delivery or separate verification is a prerequisite for this phase.

Gate: agents complete/review issues and leave public/private notes; logged-in users with the matching WordPress email and project access can see private notes across copies. Guests with matching self-entered email, logged-in users with different emails, spoofed browser actor fields, revoked users, and requests without authenticated actor context receive none. Account/WordPress email changes and cross-copy user-ID differences are covered. Credential-holding administrators remain inside the explicitly trusted boundary. Conversion preserves privacy/content and protected audit attribution; concurrent/repeated conversion is safe. Browser/account switches and cached responses do not expose previous users' notes.

### Phase 4 — Lemon Squeezy and independent deployment

Wire actual test-mode product validation, webhooks, reconciliation, portal links, complimentary entitlements, storage reporting, and the selected expiration policy. Provision only FeedbackPress resources after the Phase 0 host checks. Add a Caddy site without overwriting existing hosts. Apply memory/CPU, connection and disk limits, health checks, bounded redacted diagnostics, retention maintenance, and independent database/media export/restore tooling. The owner has deferred separate backup storage; use the existing Hetzner daily server backups as the current baseline, and do not provision storage or invent off-server recovery guarantees. Test restoration with isolated fixtures; finalize the separate destination before broader production rollout.

Gate: real test-mode purchase/activation/renewal/cancellation/expiration, wrong-product rejection, webhook signature/replay/order tests, and provider outage behavior pass. Deploy/restart/rollback preserve media and data. FeedbackPress credentials cannot access Sunrise databases/files and vice versa. Sunrise remains healthy. Test hostname and restore evidence are recorded; notification email delivery is tested separately when that feature is enabled.

### Phase 5 — pilot and cutover

Use one project across local, staging, and production WordPress copies on the production service. Test actual migration tooling without depending on it: database URL replacement, repeat copy to an existing destination, and restoring an older site database. Confirm unchanged project access, existing central issues/numbering/media, and no reconnection prompt. Test a different-project clone followed by explicit disconnect/new-project.

Legacy compatibility is out of scope. Do not delete existing local feedback while implementing the new system. At pilot cutover, choose a fresh service project, or separately authorize a one-time import if existing feedback is worth retaining. An optional import is a standalone operation, not a legacy runtime or dual-sync requirement; preserve IDs/numbers where possible and report conflicts/missing files rather than silently repairing data.

Update all pilot copies together. Keep their old database/files backed up for inspection, with old feedback writes disabled once the new service is authoritative. If rolling back, preserve/export new central writes; never reactivate an independently writable old network as if nothing changed.

Gate: a real agent batch completes tasks, updates shared statuses, writes private notes, and converts one to a human note across the pilot. Access, migration, media, outage/retry, navigation, retention, and backup checks pass before broader release. Publish the plugin/service versions and installation instructions only after the pilot evidence is recorded.

## 7. Access and decisions to request when needed

| Needed | When | Action |
| --- | --- | --- |
| Authorized SSH access | Available; inspect before provisioning | Restored and verified read-only 2026-11-11 using `ssh sunrise`; never expose key contents/passphrases. Peak capacity and connection budgets still need checking. |
| FeedbackPress hostname and DNS access | Hostname selected; HTTPS pending | Owner selected `feedbackpress.elod.in` and pointed DNS. Cloudflare proxy is visible; add/verify its own Caddy HTTPS site and certificate. Current public result is 525. |
| Account storage cap | Before enforcing real entitlements | Choose total active media bytes per account; do not invent the plan allowance. |
| Expired/unpaid subscription behavior | Before billing pilot | Decide grace, read/export access, write/upload restrictions, and eventual deletion/notice policy. Do not silently delete existing feedback. |
| Lemon Squeezy product/test setup | Before billing integration | Dedicated $30/month subscription variant with licenses; obtain IDs, server API access and webhook signing secret securely. Reuse the store, not Sunrise billing configuration. |
| Resend notification transport/sender | Before enabling transactional notifications | Obtain a dedicated FeedbackPress sending key and verified sender/domain for future mentions and substantive-change notifications. No email verification requirement for private notes. Capture test sends; private-note bodies/metadata must never go to unauthorized notification recipients. |
| Separate backup destination and retention | Deferred by owner for now | Keep existing Hetzner daily whole-server backups as the current baseline. Do not provision paid storage or request credentials. Build/test independent DB/media exports and restoration locally; revisit the separate destination and production recovery gate before broad customer rollout. |
| Existing feedback disposition | At pilot cutover | Fresh project or separately authorized one-time import; keep original data intact until decided. |

Only block work that depends on an unanswered item. Continue independent local API/plugin tests while setup is pending. Request secret-only information through the secure secret mechanism when available, never ordinary chat or committed configuration. This plan does not authorize modifying Sunrise, making purchases, deleting data, or publishing an untested service.

## 8. Execution log

- 2026-11-10: Plan recorded. Current plugin checkout fetched and compared with `origin/main` (0 ahead / 0 behind); pending user changes preserved. No implementation/deployment performed. Live Hetzner capacity remains unverified after the earlier failed SSH authentication.
- 2026-11-11: Owner chose `feedbackpress.elod.in` and confirmed SSH key unlock. Read-only host preflight succeeded; hardware/free-space/services/listeners/Caddy hostnames and recent local backup timers inspected. Small pilot looks feasible with explicit resource budgets; no peak-load certification. Public DNS is Cloudflare-proxied; HTTPS HEAD returned 525 while the origin lacks a FeedbackPress Caddy site. No server configuration or application data changed. Plugin source/destination checkouts fetched: 0 ahead / 0 behind; existing local work retained.
- 2026-11-11: Created the independent local service repository beside Sunrise Control. Added a loopback-only Node/TypeScript routing skeleton with GET/HEAD `/health`, explicit production configuration validation, unavailable business routes, and HTTP/configuration tests. Added non-secret Caddy/systemd/configuration templates and deployment boundaries. No runtime npm dependencies; dependency versions are locked. No Git remote/upstream exists yet, so no remote comparison or publication is possible. No server changes or deployment performed.
- 2026-11-11 verification: clean `npm ci` on Node 24.22.2, `npm run verify` (TypeScript and both HTTP/configuration test groups), and development/production-template `npm run check:config` passed. An earlier shell used Node 22.11.0 and reported the declared engine mismatch; supported-runtime verification above supersedes it. Initial source, lockfile, deployment templates, and this plan are being recorded in the local Git repository. No remote publication or deployment.
- 2026-11-11: Owner added/pushed `jonschr/FeedbackPress-Service`. Fetched successfully; local `main` has no upstream, so explicitly compared `origin/main`: 0 ahead / 0 behind. Implemented the Phase 1 local shared API with separate account/project credentials (only hashes stored), restricted runtime PostgreSQL role and tenant policies, offline complimentary provisioning, issue/reply editing and author reassignment, central sequential numbers, revisions/idempotency, full-thread search within statuses, list sorts/pagination and ordered change catch-up. PostgreSQL sessions explicitly use UTC.
- 2026-11-11: Implemented raw bounded media upload, account-wide atomic reservations across projects, checksum/type/length checks, private authorized download, screenshot distinction and 60-day expiry. Retention cleanup releases quota once and removes expired/abandoned bytes; no server schedule installed. File finalization/database failure is retryable. No thumbnail generation, full media decoding or malware scanning is claimed.
- 2026-11-11 verification: TypeScript and 14 automated cases passed against a fresh disposable PostgreSQL 18.6 cluster on Node 24.22.2. Covered account/project and SQL row-policy isolation, management denial, concurrent sequential numbering, repeated requests, stale edits, author editing/reassignment, cross-field full-thread search, >100-item list/change pagination, UTC sessions/timestamps, media authorization/checksums/types/size limits, cross-project quota races, interrupted upload retries, deferred COMMIT failure after durable file finalization, expiry/quota cleanup and HTTP process restart. Expected injected failure emits only a redacted 503 diagnostic. Both configuration checks and whitespace validation passed.
- 2026-11-11 manual local smoke: disposable launcher plus separate client created issue #1, saved a reply, moved it to Review and verified uploaded/downloaded PDF bytes. Ctrl-C/SIGTERM cleanup stops its isolated database and removes generated keys/media. No WordPress feedback, hosted application, Caddy, database, billing or email configuration changed. Implementation remains uncommitted for review.
- 2026-11-11 access preparation: SSH root access and GitHub dry-run push verified; Cove/WP-CLI access to Harrison and Laurel confirmed. Created FeedbackPress billing products in the owner's Chrome session: test product 1517186 / variant 2361309 published; live product 1517196 / variant 2361321 kept as Draft. Both $30/month with licenses, unlimited activations, no storefront listing. No actual purchase or email sent. API-key prompt declined; no Lemon Squeezy API credential available, so real billing/provider verification remains blocked while intercepted local tests can proceed. Email provider/sender, backup destination and proposed storage/payment policies await answers. See `docs/ACCESS.md` in the service repository for the access checkpoint.
- 2026-11-11: Queued one-time overnight continuation for 07:01 UTC (01:01 America/Chicago), in the existing thread. Scope is unblocked gateway/private-note implementation and testing, with no live billing/emails or production data acceptance while credentials/backups/policies remain unresolved.
- 2026-11-11 Lemon Squeezy completion: Owner requested continued interactive setup and explicitly approved new dedicated live/test merchant API keys, expiring May 11, 2027. Both created in the owner's Chrome session, captured only into private 0600 files outside Git, and saved by the owner in 1Password before closing their one-time displays. Read-only API verification confirmed store 349185, correct test/live product+variant ownership, $30/month subscriptions, license generation and unlimited activations. Opposite-mode product reads returned 404 for each key. Live remains Draft; test remains Published. No purchase/subscription/charge/email or webhook registration was made. API access is no longer blocked; this supersedes the earlier declined-key entry. The one-time overnight task was disabled while interactive access setup continues and has not run. Update its stale access prompt before re-enabling.
- 2026-11-11 identity simplification: Owner explicitly chose logged-in WordPress email matching for private agent notes and accepted trusted connected-site administrators as the privacy boundary. Removed separate email verification/operator-token requirements from the current contract. Guest-supplied email never grants private access. Retained Resend as a dedicated delivery service for future mentions/substantive-change notifications, with private-note visibility applied to recipients and email contents. Notification functionality is later scope; Resend is no longer a private-note prerequisite.
- 2026-11-11 Resend access: Owner approved scoped sender DNS changes under feedbackpress.elod.in; imported exactly three records (DKIM TXT, rsend/send CNAMEs, DNS-only) and confirmed all in public DNS. Main-domain MX remains Google; existing main mail records unchanged. Resend verified all three records and the domain; receiving disabled. Owner separately approved a dedicated domain-restricted Sending-access key; created and captured into a 0600 private file, with metadata outside Git. Owner subsequently confirmed saving it in 1Password; the one-time display was closed and the persisted key-detail page confirmed Sending access restricted to feedbackpress.elod.in. No real email sent and no notification code implemented. Resend is for later transactional notifications only.
- 2026-11-11 backup access inspection: Owner confirmed Resend key saved in 1Password; its persisted page confirms domain-restricted Sending access. Read-only Hetzner Console inspection shows existing daily whole-server backups enabled, seven available images (latest 2026-11-10T15:01:35Z), and no Storage Boxes/Object Storage buckets in the current project. No backup settings or paid resources changed. Independent FeedbackPress backup destination/restore verification remains pending; this does not block local gateway/private-note development.
- 2026-11-11 backup decision: Owner explicitly deferred separate backup storage. No new storage purchase or backup credential is required for the overnight work. Retain the existing Hetzner daily server backups as the current baseline, implement/test application export/restore locally, and record separate-destination/production recovery work as deferred. Interactive Lemon Squeezy and Resend access setup is complete; resume the previously authorized overnight implementation with the updated WordPress email identity model.
- 2026-11-11 overnight resumption: Updated and re-enabled the existing one-time continuation for 08:04 UTC (02:04 America/Chicago). Current access/identity/backup decisions are included; no recurring run or production launch authorized. Focus is a testable central-backed WordPress workflow, private agent notes and test billing, preserving uncommitted work and existing feedback.
- Next: Phase 2 replaces the WordPress gateway/backend and tests two site copies against one local test project while preserving existing data/UI behavior. No legacy compatibility layer. Finish Phase 0 hosting/resource/connection budgets and Phase 4 operational/security/billing gates before deploying real feedback. WordPress-authenticated private notes/conversion remain Phase 3. Record phase outcomes and verification receipts here as implementation proceeds.

## References

- Current plugin implementation: `feedbackpress.php`, `includes/api.php`, `includes/store.php`, `includes/network.php`, `includes/sync.php`, `includes/identity.php`, `includes/comments.php`, `assets/review.js`.
- Existing behavior and checks: `docs/USAGE.md`, `tests/VERIFICATION.md`, `tests/list-navigation.cjs`, `tests/stable-status-order.cjs`, `tests/titles-ui.cjs`, and author/comment/media/shortcut fixtures.
- Read-only host reference: `~/Local Sites/Sunrise Control/HETZNER.md`, `deploy/sunrise-production.service`, `deploy/backup-production.sh`, `hosted-node.ts`, `hosted-http.ts`, `hosted-auth.ts`. Recheck live facts before acting; do not reuse Sunrise secrets/configuration.
- [Lemon Squeezy subscription licenses](https://docs.lemonsqueezy.com/help/licensing/license-keys-subscriptions), [license validation](https://docs.lemonsqueezy.com/guides/tutorials/license-keys), [webhook signing](https://docs.lemonsqueezy.com/help/webhooks/signing-requests), [customer portal](https://docs.lemonsqueezy.com/help/online-store/customer-portal).
- [WordPress Application Passwords](https://developer.wordpress.org/advanced-administration/security/application-passwords/).
