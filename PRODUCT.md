# FeedbackPress

## Product
Self-hosted WordPress visual client feedback for website development and ongoing administrative review.

## Platform
Web: WordPress plugin, PHP 8.1+, vanilla JavaScript with Shadow DOM, local screenshot renderer. No build step or hosted account.

## Confirmed workflow
Named visitors select elements or comment on a whole page. Issues start To do; Doing tracks active work; Review requests client approval/input; Done records verified fixes. Agents may update statuses and add replies through REST. Default view includes To do and Review. Images and PDFs supported; video excluded.

Everyone mode exposes feedback to visitors. Administrators-only mode protects production review. Anyone with review access may change statuses. Sites connect by copying and pasting a code, without naming the network. One site list contains a URL and Local/Remote choice for each installation. Secondary review and maintenance settings are collapsed; synchronization is automatic with no Sync button. Member credentials, one-use setup codes, encoded causal configuration events, optional per-remote Basic Auth, and activity-triggered exchanges keep feedback and files aligned. Active review checks at most once per 60 seconds per installation, pauses idle/hidden, and uses no recurring sync cron. Bounded local diagnostics show HTTP results. Relative URLs support environment portability.

Review navigation defaults to all pages sorted by permanent issue reference; page grouping is also available. The sidebar is a minimal list with selected highlighting and all four one-click status icons aligned beside the issue number; the current status is highlighted instead of written out. Discussion, replies, and files live in the pin popup, which also provides status icon actions and previous/next navigation.

Issue search covers original text and every reply within the selected statuses. Lists also sort newest first by current completion date or last activity (creation, reply, status, upload). Search, sorting, and status selections persist when navigating between pages.
