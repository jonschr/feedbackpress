# FeedbackPress owner test — November 11, 2026

The coordinated update is installed: service 7bee102426c9 and QA A/B plugin 12db8317bfda. Refresh each tab once for the new assets. See UPDATE-REVIEW.md for release/checksum/verification receipts.

The central gateway, shared overlay, account project selector and private notes are ready for controlled QA. The current pilot and earlier test-license/webhook evidence are documented in PILOT-OPERATIONS.md. This continuation fixed private-note refresh/privacy and reran the acceptance checks recorded at the end of CENTRAL-SERVICE-PLAN.md. The authorized local checkpoints and coordinated pilot/QA installation are complete; no push, tag or public/customer launch occurred.

## Try the workflow

1. Open https://feedbackpress-qa-a.localhost:8453 and https://feedbackpress-qa-b.localhost:8453. These disposable copies already share the hosted complimentary QA project. Keep real client copies disconnected from this test account.
2. In A, choose Leave feedback, click an element, enter a short title (description optional), and submit. Confirm its numeric pin and screenshot. In B, open View issues; allow up to 60 seconds of active use for refresh, or reload. Confirm the same number/content.
3. Add a shared reply, edit your own comment, drag the pin and change status. Try C, V, Escape, Up/Down and status keys 1–4 outside text fields. Status keys follow the most recent real mouse movement or keyboard selection. Scroll the issue list, navigate between pages/issues, and confirm the same list position/order.
4. Log in to A as the QA administrator using Cove's one-time admin login. With the same owner email logged in on B, use a private note and confirm it appears only for that owner. An agent can create an agent note using the explicit-user command below; Convert to shared note explicitly publishes it to all project reviewers under your human name, preserving text/time and protected agent audit. Other notes remain private.
5. Open B logged out/in a private browser window: shared feedback is visible under Everyone review mode, private notes are absent. Other logged-in emails also receive no private notes. An existing open owner tab removes stale private text on its next active private refresh after access changes; access is always rechecked server-side. Refresh remains activity-driven, not instant logout broadcasting.
6. Settings → FeedbackPress shows the searchable account project selector and connected sites. Switching/removing sites changes membership, so do that only on disposable fixtures. No license key is needed to test the already-connected QA account.

Local agent example (replace ISSUE_UUID with the actual issue ID):

```sh
wp --path=/Users/jonschroeder/Cove/Sites/feedbackpress-qa-a.localhost/public --user=admin feedbackpress list --statuses=todo,review
wp --path=/Users/jonschroeder/Cove/Sites/feedbackpress-qa-a.localhost/public --user=admin feedbackpress note ISSUE_UUID --body='Private QA note' --agent='Codex'
```

For service verification, from the service repository run `npm run verify`. For gateway regression, from Harrison's plugin checkout run:

```sh
wp --path=/Users/jonschroeder/Cove/Sites/feedbackpress-qa-a.localhost/public --user=admin eval-file tests/central-gateway.php
wp --path=/Users/jonschroeder/Cove/Sites/feedbackpress-qa-b.localhost/public --user=admin eval-file tests/central-gateway.php
NODE_PATH=/tmp/feedbackpress-browser/node_modules node tests/private-notes.cjs
```

The browser command uses the existing local Playwright installation and installed Chrome. Gateway checks create QA issues/notes; they never delete existing feedback. Fixture mail is intercepted. Original Harrison/Laurel feedback has not been imported; Laurel's older source/pending work has not been replaced.

Remaining external decisions apply to paid launch: real account storage cap, unpaid-account grace/read/export behavior, and live checkout/tax acceptance. Separate backup storage remains explicitly deferred; existing Hetzner whole-server backups are the baseline. Independent local export/restore passes; independent off-server recovery is not proved. No live billing, notifications or client cutover was enabled.
