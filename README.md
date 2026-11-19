# FeedbackPress

Visual feedback for WordPress, backed by one central FeedbackPress service.

**0.4.0** requires an account key and compatible service; existing peer-sync feedback stays untouched and is not imported. The existing WordPress update feed offers this release to both legacy and central installations. After updating a legacy copy, connect an account key and select or create its central project in WordPress settings. See the [changelog](CHANGELOG.md).

- Pin issues to page elements and discuss them with replies.
- Capture screenshots and attach images or PDFs.
- Suggest text changes directly on the page, compare wording and copy replacements.
- Follow system light/dark appearance or choose it in the sidebar.
- Track To do, Information needed, Doing, Review, and Done statuses.
- Search feedback, connect site copies, and work through REST or WP-CLI.
- Read built-in [agent guidance](docs/CENTRAL-TESTING.md#built-in-agent-workflow) through WordPress MCP/Abilities, REST or WP-CLI.

## Get started

Requires WordPress 6.6+ and PHP 8.1+. Upload the FeedbackPress ZIP under **Plugins → Add Plugin → Upload Plugin**, install and activate it, then open **Settings → FeedbackPress**.

Connect your account with a license or access key, then choose a project from the searchable selector. Other installations use the same account and project. Feedback and media stay in the service; database copies register their URL automatically.

The customer key is a FeedbackPress account access key or the license supplied with a FeedbackPress purchase. Lemon Squeezy merchant API keys belong only on the central service. Project creation, selection and connected-site management all happen in WordPress, without another FeedbackPress login. See the [setup guide](docs/GETTING-STARTED.md), including the current pilot boundary.

Review access defaults to logged-in administrators and explicitly invited WordPress accounts. Share a review link for client access, or explicitly enable access for everyone. Copied links and email invitations use the project’s public HTTPS destination, never its local development URL. Links have no time-based expiry; Settings → FeedbackPress → Review access includes Revoke all shared links for the entire project. This also ends link-based browser sessions without disconnecting sites or removing WordPress accounts.

Guests can read shared feedback without identifying. Before their first ticket, reply or other contribution, they choose native WordPress login or verify their email. Email proof links expire after 15 minutes and can be used once; a Secure, HttpOnly cookie remembers the verified address for 180 days. Those short-lived proof links are separate from persistent shared-access links. Project-wide revocation also invalidates remembered guest access. Verification authorizes shared contributions and editing their own comments; private notes still require WordPress login. Editable name/email cookies are only form defaults, never proof of ownership.

Existing invited accounts are matched by email when an invitation is opened. The optional Create WordPress accounts for invited reviewers setting creates a FeedbackPress reviewer on the destination site at first use, with feedback access and no WordPress content, upload or administration capabilities. It never signs them in or replaces an existing account’s role/password. New reviewers can set their password through the native login/reset flow. Logged-in attribution retains the same email-based comment identity. Images and PDFs stay outside WordPress and expire after 60 days.

## Shortcuts

**C** toggles feedback mode, **T** selects text editing, **V** toggles issues, and **Escape** exits placement. **Command/Ctrl + Enter** submits a comment. Shortcuts leave typing fields alone.

See [central service testing](docs/CENTRAL-TESTING.md) for the current pilot and agent commands.

The [central service plan](https://github.com/jonschr/feedbackpress/blob/main/docs/CENTRAL-SERVICE-PLAN.md) records the architecture and remaining paid-service gates.

## License

[GPL-2.0-or-later](LICENSE). Bundled [html2canvas-pro](assets/vendor/html2canvas-pro-LICENSE.txt) and [Plugin Update Checker](vendor/plugin-update-checker/license.txt) retain their MIT licenses. [Inter](assets/fonts/LICENSE-Inter.txt) uses the SIL Open Font License.

Local development checkout: `~/Local Sites/FeedbackPress Plugin`. Local Harrison uses the packaged WordPress release, not a linked development tree.
