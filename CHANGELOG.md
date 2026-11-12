# Changelog

## 0.3.0-beta.3 — November 12, 2026

- Reveal issue pins with native element scrolling, bypassing theme window-scroll wrappers and temporarily controlling smooth scrolling, scroll snap and scroll anchoring.
- Correct delayed theme resets and layout shifts for a bounded 2.5–5 seconds. Account for fixed/sticky headers, scaled nested scroll panes, horizontal/RTL scrolling and saved-location fallback.
- Give manual page scrolling immediate control; sidebar/thread interaction stops correction while retaining snap protection. Restore prior styles on dismissal, navigation, hidden tabs or manual page input, preserving concurrent theme style edits.
- Tested on Secure AI Now with a controlled delayed scroll reset, plus intercepted navigation/layout/target/keyboard regressions. Fully virtual transform-driven scrolling engines may require a dedicated adapter; this beta does not claim universal control over arbitrary theme JavaScript.

Stable automatic updates remain 0.2.2; existing latency and production gates below are unchanged.

## 0.3.0-beta.2 — November 12, 2026

- Replace the shared 100-per-ten-minute write limit with fixed one-minute, per-project budgets: 600 changes per native WordPress user or 120 per guest IP. Background activity snapshots use read permission and consume no edit budget. Rejections return remaining seconds and Retry-After instead of extending a ten-minute lockout.
- Keep origin, nonce, native actor, ownership and project checks. Browser actor/forwarded-IP overrides cannot change the limiter identity.
- Preserve service error codes and distinguish missing issues/notes from missing files. Bounded lifecycle diagnostics record operation/status/code without feedback text, identities, tokens or IDs.
- Exercise issue deletion/retry/missing-item errors through the actual WordPress REST route on two isolated gateways. A reported historical delete failure has not been reproduced; no customer feedback/delete action was replayed.
- Limit dark page-header titles to one line with an ellipsis.

Known beta latency, email-verification and production gates below remain unchanged. Stable automatic updates remain 0.2.2.

## 0.3.0-beta.1 — November 12, 2026

This is a breaking beta of the central-backed FeedbackPress workflow. It requires a compatible FeedbackPress service and an account key. Existing peer-sync feedback stays untouched; this version does not import it or synchronize through the old peer protocol. The stable automatic-update channel remains at 0.2.2.

- Connect an account in WordPress, choose/create labeled projects, and see connected site copies.
- Shared central issues, replies and media with stable issue numbers, revision conflict checks and safe retries.
- Owner-private issues, replies and human/agent notes, with editing, explicit publication and recoverable deletion. Private access uses the matching logged-in WordPress email; review links grant shared access only.
- More resilient pins, preserved query parameters, continuous cross-page review, temporary shared caching and background save/upload progress. Navigation-aborted uploads stay resumable instead of retaining a transport error.
- Five statuses with counts and keys 1–5, mouse/keyboard target precedence, Up/Down and N/P issue navigation.
- Compact list/page/current-page views, six date sort orders, page titles and clickable muted page links; reply counts and attachment thumbnails.
- Direct sidebar attachment lightboxes, larger image/PDF previews, one-click downloads and multi-image drag/drop replies.
- Shared/private notes in original posting order, friendly local timestamps and equal visual hierarchy.
- Mention completion and project notification-destination selection. Email delivery remains capture-only pending owner verification.

Controlled pilot release. Live paid billing/customer production acceptance and final allowance/grace/recovery decisions remain separate gates. Media retention is 60 days. No automatic legacy-feedback import or deletion.

### Known beta limitations

The strict under-100ms cached-open benchmark failed on the release Mac (also reproduced with the earlier UI checkpoint). Prior runs were faster; this release does not claim a universal latency guarantee. A previously reported issue-count difference in already-open QA tabs remains unreproduced; fresh gateway inventories matched. Email verification and paid/customer production gates remain deferred.
