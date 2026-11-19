# FeedbackPress 0.4.0 release review

Prepared November 18, 2026. The pre-release review below is retained. Plugin 0.4.0 is now published and service 0.1.3 deployed; the final release receipt follows this review.

## Security findings resolved

- **Guest comment impersonation:** knowing an author's email previously permitted an editing claim. Guests now verify email before their first contribution. WordPress validates a signed, site/project/grant-bound proof; core atomically consumes it and requires a distinct verified reviewer for shared issue/media writes. Comment ownership is checked against that attested email, not browser attribution. Native WordPress login bypasses verification and remains the only private-note identity.
- **Persistent sharing revocation:** shared grants are versioned per project. Revocation invalidates copied, invitation and notification links plus further guest requests and remembered guest proof. Native account membership is separate. Copied sharing and invitations require a connected public HTTPS destination; owner environment navigation can deliberately open local environments.
- **REST boundaries:** input cookies/navigation metadata are sanitized; browser origin/nonces, project and expected actor remain checked. Authorized native CLI/Application Password writes work without a browser nonce. Raw attachment handling only intercepts FeedbackPress file routes. Every review mode resolves identity through an uncached bootstrap; public page caches contain no verified reviewer configuration. Rendered hostile issue/reply/author/file/invitation text cannot become executable markup or unsafe links.
- **Invitation identity:** invitations never log recipients in. Existing accounts retain their role/password; optional new reviewers receive only feedback access. Neither email verification nor shared links grants private-note or WordPress administration access. An already authorized WordPress login takes precedence even when a supplied link has expired or been revoked.

Guest proof links last fifteen minutes and are single use. Remembered proof lasts 180 days in a Secure, HttpOnly, SameSite=Lax cookie, scoped to the site/project/current review grant. This does not change non-expiring shared-access links. Rate limits and stable request identities bound delivery; explicit resend creates a new operation. Local sites use WordPress login rather than sending verification to local URLs.

The accepted trust boundary remains unchanged: connected WordPress administrators and holders of site credentials can attest identity. A compromised WordPress installation or stolen gateway credential is outside the protection supplied by browser email proof.

## Simplification

Removed obsolete peer-sync conflict fields, warnings and resolution branches. Central stale revisions, draft restoration and text-target conflicts remain. Invitation and verification email delivery share the existing transport without another dependency. Undefined/unused first-party JavaScript and unused TypeScript locals/parameters checks are clean. No broad reformat or speculative architecture change is included.

## Verification

- Isolated Linux/PostgreSQL `npm run verify`: **58/58**.
- Native source-loaded WordPress: email verification, invitation accounts, canonical grant exchange, reviewer config, independent grant signature/access checks, REST/CLI agent sharing and rate/origin/nonce/identity guards pass with intercepted HTTP/mail.
- Browser correctness: **64/64 suite runs have passing final coverage**. The main run passed 63/64; the anonymous-reading run captured a stale launcher-spacing assertion, corrected and passed separately. Both the initial failure and rerun logs are retained. Focused verification, HttpOnly transport, draft continuation/cancellation, resend, expired-tab recovery, public bootstrap and native-login precedence pass. No actual email or client feedback was sent.
- PHP syntax: all eleven first-party runtime files pass. JavaScript syntax and ESLint pass. Production npm audit: zero known vulnerabilities.
- WordPressCS **3.4.1 security rules: zero errors/warnings**. The new email verification class passes the **full** standard.
- Full runtime WordPress standards review: **4,347 errors / 83 warnings**, including 4,203 automatically fixable findings. Most are spacing, indentation, short-array syntax, inline statements and documentation conventions in existing compressed code. This is an explicit style backlog, not a full-compliance claim. The dedicated security gate does not suppress these from the full report.

Private evidence is under `~/Library/Application Support/FeedbackPress/private/milestone-review-20261119T025747Z`; the final core receipt is `shared-access-20261119T033316Z`. Disposable core directories were removed after verification. Pre-release tests changed no production database, mail configuration or other hosted application. The final receipt documents the subsequent additive production migration.

## Release limits and rollout

The isolated strict Chrome timing suite **fails its 100ms target**: cached issue #1 displayed after **345.6ms**, with an **11.7ms synchronous handler**. This is the documented pre-existing first-open latency category (earlier release runs also missed the target); no performance fix is claimed. Correctness coverage is separate. Safari/Firefox and live Harrison Staging are not re-certified here. Tests model normal review sessions and bounded concurrency; they are not a large-scale production load certification. Real inbox delivery of the new verification email is not claimed; provider payloads and failure/retry handling are tested without sending.

Deploy the reviewed core plus additive shared-links migration and notification claim functions, then install the matching plugin across connected sites promptly. The new core rejects unverified anonymous writes from old gateways; native logged-in access remains available. Preserve a private database/config/source backup and an application rollback release. Do not update the public JSON updater to 0.4.0 until the exact release ZIP exists and has been checked. Publication and deployment are documented in the final receipt below.

Version 1.0 awaits a production payment replacement for Lemon Squeezy. Its [official announcement](https://www.lemonsqueezy.com/blog/saying-goodbye-to-lemon-squeezy) closes new store registration and sets March 31, 2027 as the end of payment processing. No live billing activation is included here.


## Published plugin 0.4.0 / service 0.1.3 — November 18, 2026

Normal plugin release 0.4.0 is published from c9fd5aa4a6858f483dac0ce6e4f532ffe2b056d0. ZIP: https://github.com/jonschr/feedbackpress/releases/download/0.4.0/feedbackpress-0.4.0.zip ; SHA256 64e64b0eea441e774ec7ad28818816fd5c83f2a19da8fb8cca64ee7eb7c5f13b. The 146-file archive, manifest and checksums were downloaded and compared byte for byte; anonymous public ZIP download also matches. Main's JSON updater advanced only after the ZIP was public. Actual native WordPress normal/update-AJAX checks pass, and its request to the unchanged public feed returns 0.4.0 after GitHub's ordinary 300-second cache propagated.

Service 0.1.3 is published from 37a239555fd0916b5344b5a2242f915cfbc4ab31, archive SHA256 604bdf75ef81b273fd23434d22660f4c36c8fb234b9d27061dfb29b719b4fda4, and active at /opt/feedbackpress/releases/37a239555fd0. Protected config, mailer and Caddy hashes match. Backup: /var/backups/feedbackpress/before-0.1.3-20261119T041925Z; previous application /opt/feedbackpress/releases/549012270602 is retained. With only FeedbackPress API/maintenance briefly stopped, a private database/media/config backup was taken, shared-links.sql and notification claim functions were applied, and normalized hashes proved every original table row and media byte unchanged. Only the new project columns receive default version 0 / accounts false. Timers were restored; loopback/public health/readiness/capabilities pass. Other hosted applications and database services remain active. Roll back code only; do not drop added schema or overwrite newer feedback.

Verified physical packages are installed on Harrison, Laurel, QA A/B and onboarding A/B; Alliance's existing Harrison link is unchanged. All installed hashes match and all plugins remain active. Site settings/connection hashes and original issue/reply/file IDs are retained; pre-install visible issue counts were Harrison49, Alliance10, Laurel18, QA15 each and onboarding2 each. Twenty-one actual HTTPS JS/CSS/bootstrap responses match. Installed Harrison/Alliance/Laurel checks pass real native access, canonical central grant validation, anonymous bootstrap, mandatory guest proof and private isolation without creating feedback or sending email. Public/staging installations outside these local copies receive the updater offer; no remote WordPress installation is claimed.

Validation: final versioned service npm run verify passes 58/58, retaining the reviewed 64 browser correctness groups, native WordPress checks and clean security scans. Existing strict 100ms first-open miss (345.6ms), full WPCS formatting backlog and untested real verification inbox/Safari/Firefox remain documented. Runtime dependencies are unchanged except root version metadata. No billing or notification delivery policy changed. Private receipt/manifests/backups: /Users/jonschroeder/Library/Application Support/FeedbackPress/private/release-0.4.0-20261119T041503Z.
