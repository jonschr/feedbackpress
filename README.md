# FeedbackPress

Visual feedback for WordPress, backed by one central FeedbackPress service.

- Pin issues to page elements and discuss them with replies.
- Capture screenshots and attach images or PDFs.
- Track To do, Information needed, Doing, Review, and Done statuses.
- Search feedback, connect site copies, and work through REST or WP-CLI.

## Get started

Requires WordPress 6.6+ and PHP 8.1+. Upload the FeedbackPress ZIP under **Plugins → Add Plugin → Upload Plugin**, install and activate it, then open **Settings → FeedbackPress**.

Connect your account with a license or access key, then choose a project from the searchable selector. Other installations use the same account and project. Feedback and media stay in the service; database copies register their URL automatically.

The customer key is a FeedbackPress account access key or the license supplied with a FeedbackPress purchase. Lemon Squeezy merchant API keys belong only on the central service. Project creation, selection and connected-site management all happen in WordPress, without another FeedbackPress login. See the [setup guide](docs/GETTING-STARTED.md), including the current pilot boundary.

Review access initially allows everyone. Choose administrator-only access for private review. Images and PDFs stay outside WordPress and expire after 60 days.

## Shortcuts

**C** toggles feedback mode, **V** toggles issues, and **Escape** exits placement. **Command/Ctrl + Enter** submits a comment. Shortcuts leave typing fields alone.

See [central service testing](docs/CENTRAL-TESTING.md) for the current pilot and agent commands.

The [central service plan](docs/CENTRAL-SERVICE-PLAN.md) records the architecture and remaining paid-service gates.

## License

[GPL-2.0-or-later](LICENSE). Bundled [html2canvas-pro](assets/vendor/html2canvas-pro-LICENSE.txt) and [Plugin Update Checker](vendor/plugin-update-checker/license.txt) retain their MIT licenses. [Inter](assets/fonts/LICENSE-Inter.txt) uses the SIL Open Font License.
