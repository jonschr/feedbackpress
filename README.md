# FeedbackPress

Self-hosted visual feedback for WordPress websites.

- Pin issues to page elements and discuss them with replies.
- Capture screenshots and attach images or PDFs.
- Track To do, Doing, Review, and Done statuses.
- Search feedback, sync environments, and work through a REST API.

## Get started

Requires WordPress 6.6+ and PHP 8.1+. Install the `feedbackpress` folder in `wp-content/plugins`, activate it, and open **Settings → FeedbackPress**.

Review access initially allows everyone. Choose administrator-only access for private review. Attachments use private storage outside the Media Library.

## Shortcuts

**C** leaves feedback, **V** toggles issues, and **Escape** exits placement. **Command/Ctrl + Enter** submits a comment. Shortcuts leave typing fields alone.

See the [usage and API guide](docs/USAGE.md) for setup, synchronization, and development checks.

## License

[GPL-2.0-or-later](LICENSE). Bundled html2canvas-pro retains its [MIT license](assets/vendor/html2canvas-pro-LICENSE.txt).
