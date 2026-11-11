# Restart handoff — November 11, 2026

**Restart complete.** The allocation problem cleared without a system change. All 22 service tests and both real local WordPress gateway checks now pass. Source review/browser acceptance and candidate packaging are complete. Read UPDATE-REVIEW.md for the current approval/rollout gate; the pre-restart notes below are historical.

The owner asked to be told when it is safe to restart the Mac. All current source changes are saved and uncommitted. No push/tag/release, hosted deployment, kernel change, database import/deletion, billing action or email delivery occurred in this continuation. The earlier hosted pilot remains running independently of this Mac.

## Resume here

1. Resolve/fetch/compare all three repositories again after the restart/substantial pause. Service main has no upstream; explicitly compare origin/main. Latest successful comparisons: service 7 ahead/0 behind, Harrison 2 ahead/0 behind, Laurel 0/0. Preserve all pending work. Pause before integrating incoming commits under the owner's Git rule.
2. From the service root run `npm run verify` once. Earlier in this thread the real isolated PostgreSQL suite passed 20 cases. Current attempts fail before SQL executes: macOS `shmget(..., size=56)` returns ENOMEM. Installed Intel PostgreSQL 18.6 and an independently built ARM 18.6 both reproduced it. Observed limits: shmmax 4194304, shmall 1024, shmmni 32, shmseg 8. No system setting was changed, no unrelated process was stopped, and no existing database was attached to. A restart was selected as the next attempt; do not treat the earlier question about adjusting limits as approval. If failure persists, diagnose/seek approval for an appropriate temporary setting change, using secure secret entry for any required sudo password.
3. Finish real DB acceptance for the new bounded fingerprint and shared conversion cases in tests/api.test.ts. Fix failures; TypeScript currently passes. No schema migration is expected (existing JSONB targets and note archive/audit columns).
4. Start the disposable local API (`npm run dev`), then use the private printed connection file via FEEDBACKPRESS_ANCHOR_FIXTURE to run Harrison's tests/anchor-gateway.php on QA A and B with explicit --user=admin. It temporarily filters the connection only in that CLI process, never writes their saved connection options, and touches only a fresh local project. Stop the disposable launcher afterward.
5. Re-run the browser regressions below and finish source review, particularly task cancellation/storage failures, identity/project scope, and concurrent revision handling. The browser queue/caching changes are substantial; do not call the full workflow verified until DB/gateway checks pass.
6. Prepare a reviewed checkpoint/package and coordinated service/plugin rollout only within authorization. The owner previously required uncommitted changes and no release/push; deploy/README.md requires packaging tracked source from a reviewed commit with checksums. Do not silently commit or deploy around that boundary. No public/customer launch is authorized.

## Implemented in source

Service: validation.ts accepts bounded optional target fingerprint v1 plus independent page coordinates, and relative paths preserve queries. tests/targets.test.ts checks bounds/query retention. tests/api.test.ts adds real create/retry/move/snapshot round trips and changes conversion acceptance.

Service notes.ts: new explicit conversion publishes one shared human comment with the original body/time, archives the private note and retains protected audit, advances issue revision/change feed, and handles repeated/concurrent conversion. Unconverted private notes stay private. Existing private human/earlier converted notes are not automatically published. This is an explicit NEW owner decision, superseding the earlier preserve-private conversion policy. notes.ts and PHP gateway conversion response handling need actual DB/gateway acceptance after restart.

Harrison plugin assets/review.js: layered target capture (selectors, stable ID/class/tag, text, relative href/src paths and landmark); scored identity matching with ambiguity fallback; independent saved document point; shared resolution across pin/draft/capture/navigation; resolution caching invalidated by relevant host DOM changes. Existing stored targets are recovered without rewriting feedback. Dragging creates a fresh fingerprint/page point.

The page address is relative pathname PLUS the original query string, including repeated/encoded parameters. This generic query fix alone is already applied to the physical QA A/B scripts, after private backups. Previously discarded query parameters in older notes cannot be reconstructed from the saved path alone; do not silently guess or rewrite those records.

Shared issue data: 30-second session cache scoped by site/project/actor, at most 200 entries and persisted active issues only. Private note responses never enter it. Cached issue opening is synchronous, with background refresh and revision guards. Shared media uses a short in-memory bounded cache (20 MiB/eight entries), with revocation on access denial/page exit.

Shared saves: optimistic create/reply/edit/status UI, no global overlay lock, temporary unnumbered pending pins until server acknowledgment, stackable progress/success/error cards. Server writes retain revisions and stable idempotency IDs. Browser IndexedDB holds pending SHARED text/file jobs; a synchronous session journal bridges immediate navigation. Uploads retry/resume with their original IDs without duplicating replies/files. If navigation interrupts attachment persistence before IndexedDB completes, text can resume and an explicit reattach-files error appears. Failed drafts can be restored; unknown-ack operations retain the original request ID to avoid duplication. Private note writes use memory-only progress/retry, not this persistent shared queue.

PHP includes/api.php sanitizes the shared issue returned by conversion. UI action says Convert to shared note, checks the response actually published, and removes the private presentation on success.

## Current runtime versus source

- Hosted API remains prior release e2895d7. It DOES NOT yet preserve the new fingerprint/page fields or implement public conversion.
- QA A/B retain the previously installed overlay plus the isolated query-string fix. Do not copy the whole new source overlay there before coordinated backend validation/rollout.
- Harrison is the current central plugin source with these pending edits. Laurel retains its older implementation and all its pending user edits; only documentation mirrors were updated.
- No saved QA/client connection options were switched; no existing central feedback was rewritten/deleted. Private backups of QA scripts live in the existing private FeedbackPress directory (0600).

## Checks completed this continuation

- `npm run check` passes. `node --experimental-strip-types --test tests/server.test.ts tests/targets.test.ts`: 3 passing cases.
- `npm run verify` attempted but BLOCKED at initdb by macOS shared-memory allocation. Do not claim current full PostgreSQL/API/conversion/export acceptance. Earlier 20-case receipt predates these source changes.
- Chrome intercepted fixtures passed after adapting old busy-state tests to wait for durable acknowledgment where needed: anchor-fingerprint, target-recovery, query-navigation, instant-interactions, stable-status-order, list-navigation, central-client, comment-edit, private-notes, shared-conversion, navigation-shortcuts, titles-ui, screenshot-pin (four real renderer scenarios), passive-pins, pin-drag, pin-startup and review-design.
- Delayed-server timing fixture: cached opening/status visible responses were approximately 2–26 ms across repeated runs, while detail GETs were delayed 900 ms. This measures browser-visible response, not network confirmation or complete cross-document page load. Initial uncached reads and fresh private authorization still require network.
- Queue fixture proves reply/upload interactions stay available, injected upload failure is retryable, and full document navigation resumes with one reply and one file. This uses intercepted HTTP; real gateway coverage remains pending as above.
- JS/PHP syntax checks pass. Rendered progress/error cards inspected at /tmp/feedbackpress-background-work.png. Temporary test/native build artifacts may disappear on restart and are not required source.

## Files/repositories

Service: /Users/jonschroeder/Local Sites/FeedbackPress Service
Plugin source: /Users/jonschroeder/Cove/Sites/harrison-jet-guns.localhost/public/wp-content/plugins/feedbackpress
Other preserved checkout: /Users/jonschroeder/Cove/Sites/laurel-preston-hollow-2026.localhost/public/wp-content/plugins/feedbackpress

Keep the existing access, independent infrastructure, test billing, deferred backup and no-notifications boundaries in AGENTS.md / CENTRAL-SERVICE-PLAN.md / ACCESS.md. No subagents are authorized.
