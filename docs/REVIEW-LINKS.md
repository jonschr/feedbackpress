# Client review link

Current source uses one reusable link per HTTPS site connection. In **Settings → FeedbackPress → Review access**, **Every visitor / Logged-in administrators / Nobody (disabled)** controls who can use FeedbackPress without a link. New installations default to Logged-in administrators; explicitly saved access choices remain in effect. A valid client link enables shared feedback through the administrator-only gate; Nobody disables all review access.

Open **Client review link** and choose **Copy review link**. WordPress retrieves the same reusable URL from the authenticated central API each time. Copy it from the live or staging copy your client can reach, and send it through your normal communication channel. There are no individual invitations, labels, link list, expiry picker, revoke controls, or separate sharing-permission setting. Only the connection's WordPress administrator can retrieve the link; an invited guest cannot use connection management.

Anyone holding the link can use shared issues, replies, attachments and status changes. It grants no WordPress login, verified email, administration or private-note identity. Private notes still require project access and a logged-in WordPress user with the matching server-resolved email.

The URL fragment is exchanged for a Secure/HttpOnly/SameSite=Lax site cookie and removed from the browser address/history. Original query strings and issue fragments are preserved. Browser sessions last up to 30 days; reopening the same reusable link starts another session. **End review session** ends only that browser's session. There is no invitation expiry. The link is scoped to the current HTTPS site/project/connection credential, and replacing/disconnecting that connection invalidates it through normal connection authorization. No new invitation records or schema are required. Old local invitation metadata is left untouched and unused, with no legacy adapter.

The central API derives a purpose-separated HMAC from the authenticated connection; the returned link cannot act as a service/project API credential. WordPress validates the same signature against its current server-side connection, without an additional network call for each pin/list permission check. Normal service requests still enforce site binding, current credentials, entitlement and project isolation. Gated cached HTML contains only the public bootstrap; reviewer configuration is fetched through the existing no-store session route. Hosting passwords/firewalls remain outer access controls.

## Testing and installation

See the canonical service PILOT-OPERATIONS.md and CENTRAL-SERVICE-PLAN.md for the installed releases, validation receipts and rollback. The service and plugin must be updated together; the earlier invitation-management version has a different endpoint contract. Email delivery remains deferred; copying a link sends no email.
