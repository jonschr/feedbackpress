# Central service pilot

FeedbackPress now saves shared issues, replies, authors, statuses and files to a central API. WordPress stores its encoded limited account-management and active site/project connections, local review access and bounded diagnostics. Existing peer-sync feedback is not imported or deleted. This is a breaking beta; do not use the old peer-sync APIs/tests against it.

## Connect sites

Open Settings → FeedbackPress. Connect your account with a license or account access key, then search and select a project. License/root keys are used once and never saved in WordPress. A limited manager credential stays server-side for project selection and site management; a separate site-bound token accesses feedback. WordPress administrators can manage projects in the connected account. No connection codes are needed.

Switching projects removes this URL from the old project without moving feedback. Remove beside a site revokes its project access and prevents automatic rejoining; an administrator can explicitly select a project to reconnect it.

A database clone keeps the encoded connection and automatically registers the new home URL when the overlay is used. A known destination URL keeps its centrally selected project even when the copied database names a different project. It does not need to know whether it is local, staging or production. Unrelated copies should disconnect and choose a different project.

Every review-capable page can display filtered passive pins. Active views refresh automatically, at most once per minute per installation, and pause when idle/hidden. There is no WordPress sync cron or manual sync button. Writes go directly to the service; failed writes retain the draft for retry.

Images/PDFs are streamed through the WordPress gateway and saved only centrally, with a 5 MiB file limit and 60-day expiry. The pilot has an explicit test storage allowance, not a finalized paid plan limit. No WordPress Media Library records are created.

## Agents

Use the WordPress installation's ordinary authentication. Local WP-CLI requires an explicit user:

```sh
wp --user=<login> feedbackpress list --statuses=todo,review
wp --user=<login> feedbackpress get <issue-uuid>
wp --user=<login> feedbackpress status <issue-uuid> --status=done --revision=<current-revision>
wp --user=<login> feedbackpress note <issue-uuid> --body='Private implementation note' --agent='Codex'
wp --user=<login> feedbackpress notes <issue-uuid>
wp --user=<login> feedbackpress reply <issue-uuid> --body='Shared client-facing reply' --revision=<current-revision>
wp --user=<login> feedbackpress convert <issue-uuid> <note-uuid> --revision=<note-revision>
```

`note` defaults to private. `reply` is explicitly shared. Private notes sync centrally but are returned only for the server-resolved logged-in WordPress email matching their owner. Guest-entered emails and browser-supplied actor headers do not grant access. Connected administrators/project credential holders are trusted to attest actors. Convert to my note preserves body, timestamp and privacy while keeping protected agent audit history.

REST mirrors the overlay under `feedbackpress/v1`: issues, replies, status, target, comments, files, and `issues/<uuid>/notes`. Use WordPress Application Password authentication for remote agents and a UUID `Idempotency-Key` for each mutation. Retry the same payload with the same ID; fetch the current issue revision before a deliberate new change. Project/account credentials never need to be given to the agent.

## Checks

`tests/central-gateway.php` runs only on a disposable `feedbackpress-qa-*` WordPress site and creates test issues. Frontend `.cjs` fixtures intercept all writes; legacy peer-storage tests have been retired. See the service repository's `npm run verify` for PostgreSQL isolation, retries, media quota/expiry, private-note ownership and export/restore checks.
