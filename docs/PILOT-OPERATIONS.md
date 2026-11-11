# FeedbackPress pilot operations

Verified November 11, 2026. This is a controlled beta; live paid billing remains disabled.

## Running deployment

- Public origin: https://feedbackpress.elod.in; `/ready` returns 200.
- API release: `e2895d7`, `/opt/feedbackpress/current`, Node 22.23.3. Source is tracked in this independent repository; local checkpoints have not been pushed publicly.
- API: `feedbackpress.service`, user/group `feedbackpress`, loopback 8791. 128 MiB JS heap, 256 MiB service memory cap, 25% CPU cap, four-connection database pool. Journal output contains classification/status only, rate limited to 30 entries/minute.
- Independent PostgreSQL 18 cluster: `feedbackpress`, loopback 55494; dedicated OS user `feedbackpress-db`, owner `fp_owner`, restricted runtime `fp_runtime`. Data `/var/lib/feedbackpress-db/data`; socket/PID directory `/run/feedbackpress-db` recreated by tmpfiles. Shared buffers 32 MiB, 12 maximum connections, 224 MiB systemd memory cap, 25% CPU cap. Runtime has no ownership/bypass privileges.
- Private configuration: `/etc/feedbackpress/config.json`; provider test secrets beside it. Root/service-group access only. Media `/var/lib/feedbackpress/media`, outside releases and web roots. Root provisioning credentials are outside releases/Git. No Sunrise or Guest Key database/credentials/app services are shared.
- Maintenance: `feedbackpress-expire.timer` daily at 04:20 UTC plus random delay. Removes expired media, abandoned uploads and expired 15-minute management sessions. Media expires after 60 days. This is service retention, not WordPress sync polling.
- Caddy host uses explicit hostname-scoped Cloudflare Origin CA certificate/key in `/etc/caddy/feedbackpress`. **Renew before November 11, 2027, 08:47 UTC.** Automatic Let's Encrypt issuance failed behind the proxy; no protection was disabled. The private key was generated and retained on the server.
- Latest resource check: API about 44 MiB resident cgroup usage, host about 1.1 GiB available RAM and 29 GiB free disk. This is a small pilot observation, not a load guarantee. Existing Sunrise production/staging, Guest Key, PostgreSQL main and Caddy remained active.

## Disposable WordPress sites

`https://feedbackpress-qa-a.localhost:8453` and `https://feedbackpress-qa-b.localhost:8453` share the complimentary **FeedbackPress hosted QA** project. `https://feedbackpress-qa-migrated.localhost:8453` uses the sandbox customer's **Licensed QA project**. Each has a physical plugin copy, not a symlink. Existing Harrison/Laurel peer feedback has not been imported or deleted. Do not silently connect real client sites to QA accounts.

Settings → FeedbackPress: enter a license/access key once, then use the searchable project selector. Create project and Remove site are account-managed. Switching detaches only this URL and does not move feedback. A removed copy cannot automatically rejoin. Database copies register new URLs automatically; known destination URLs keep their central project selection.

The license/root key is never saved in WordPress. Encoded server-side storage contains a limited manager credential plus the active site-bound project credential. WordPress administrators can manage every project in the connected account. Never expose these values to frontend JavaScript. Encoding protects literal URLs against migration replacement; it is not encryption.

For local agents use `wp --user=<owner> feedbackpress help`. Private notes use that authenticated user's email and remain private after Convert to my note. Public `reply` is separate. Remote agents can use WordPress Application Passwords; any hosting Basic Auth remains an outer gate. See the plugin's CENTRAL-TESTING.md.

## Verification and backup baseline

Service `npm run verify`: 20 passing cases, real disposable PostgreSQL and restricted roles. Hosted WordPress project management, central feedback/private-note gateway, cloned membership resolution and public media preview passed. Browser regressions cover project selection/error/removal, keyboard/editable guards, passive pins, titles/edits, stable ordering and exact navigation scroll, screenshot pins and lost-acknowledgment retries.

Lemon Squeezy test product 1517186 / variant 2361309 is published and sandbox-only. Actual test purchase/license exchange works; signed provider webhook invalidation/recovery yielded HTTP 403 then 200 with two accepted delivery receipts. Live product 1517196 remains Draft; service rejects live billing configuration. Test allowance is 100 MiB per account. Resend sending access is reserved for future notifications; no notification sender is running.

Hetzner's existing daily whole-server backups are enabled. The owner deferred separate off-server storage. Private DB/media exports are stored under `/var/backups/feedbackpress` and the local private FeedbackPress directory; they contain private notes and credentials/hashes and must never be attached to releases. The post-membership export (`pilot-memberships-20261111.tar.gz`) restored 3 issues, 4 private notes and 2 ready files into an isolated temporary cluster, verifying every ready file's size/SHA-256 plus runtime restrictions. These manual QA exports are not recurring independent backups: remove them within 7 days of this test, and before accepting real data choose the ongoing backup/restore/retention policy. Daily whole-server backups have seven available images.

## Update and recovery

Fetch/compare before development or deployment. Package tracked, tested source into a new immutable release. Install locked runtime dependencies there. New schema support uses offline owner access only; apply `admin.ts memberships-init fp_runtime` once for the site-membership revision, never run schema updates through the API role. Switch the current symlink atomically and restart only feedbackpress.service. Verify `/ready`, a scoped write/media read, and all existing host services.

Previous API release is retained at `/opt/feedbackpress/releases/fd6ddf6`. For code-only rollback, atomically point current there and restart FeedbackPress. Membership schema is additive except the authenticate return shape, whose extra fields are compatible with old callers. A code rollback loses site-membership enforcement and the v3 WordPress connection contract; roll back the plugin too and reconnect only disposable fixtures. Do not drop tables or restore a stale database automatically. For corruption restore the verified DB/media pair offline into the isolated FeedbackPress cluster; never target PostgreSQL main.

Before paid launch: approve the real storage cap and inactive-account read/export/grace policy, confirm live checkout/tax presentation, and decide the ongoing independent backup destination. Notifications and stronger independent email identity remain outside this pilot.
