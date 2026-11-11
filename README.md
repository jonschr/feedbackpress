# FeedbackPress

Visual feedback for WordPress, backed by one central FeedbackPress service.

- Pin issues to page elements and discuss them with replies.
- Capture screenshots and attach images or PDFs.
- Track To do, Doing, Review, and Done statuses.
- Search feedback, connect site copies, and work through REST or WP-CLI.

## Get started

Requires WordPress 6.6+ and PHP 8.1+. Install the `feedbackpress` folder in `wp-content/plugins`, activate it, and open **Settings → FeedbackPress**.

Connect your account with a license or access key, then choose a project from the searchable selector. Other installations use the same account and project. Feedback and media stay in the service; database copies register their URL automatically.

Review access initially allows everyone. Choose administrator-only access for private review. Images and PDFs stay outside WordPress and expire after 60 days.

## Shortcuts

**C** toggles feedback mode, **V** toggles issues, and **Escape** exits placement. **Command/Ctrl + Enter** submits a comment. Shortcuts leave typing fields alone.

See [central service testing](docs/CENTRAL-TESTING.md) for the current pilot and agent commands.

The [central service plan](docs/CENTRAL-SERVICE-PLAN.md) records the architecture and remaining paid-service gates.

## License

[GPL-2.0-or-later](LICENSE). Bundled [html2canvas-pro](assets/vendor/html2canvas-pro-LICENSE.txt) and [Plugin Update Checker](vendor/plugin-update-checker/license.txt) retain their MIT licenses. [Inter](assets/fonts/LICENSE-Inter.txt) uses the SIL Open Font License.
