# Set up FeedbackPress in WordPress

You need the plugin ZIP, administrator access to WordPress, and your FeedbackPress customer key. No separate FeedbackPress website login is required for project management.

1. In WordPress, open **Plugins → Add Plugin → Upload Plugin**. Choose the ZIP, install it, then **Activate Plugin**.
2. Open **Settings → FeedbackPress**.
3. Paste your key into **License or account access key**, then select **Connect account**. The service address is already filled in; ordinary installations do not need to change it.
4. Choose a project by its name in the searchable **Project** field. If this is your first project, select **Create a project**, give it a label, then **Create and connect**. Creation also connects this installation.
5. **Connected sites** lists every currently connected copy and marks **This site**. On another WordPress copy, install the same ZIP, enter the same customer key, and select the same project. Both copies then use the same central issues and media.
6. Open the site's front end to leave feedback. Under **Review access**, choose whether everyone or only logged-in administrators can review, or disable review on this copy.

Project selection, project creation, site removal and reconnection stay in this WordPress dashboard. Switching a copy to a different project changes that copy's membership; existing feedback stays with its original project. Removing a copy leaves other copies and feedback intact. A copied database can retain its connection, so deliberately choose a new project when repurposing an unrelated site.

## Which key?

For the current complimentary owner pilot, use the **FeedbackPress account access key** supplied privately by the service operator. It is independent of Lemon Squeezy and does not create a charge. The owner's explicit pilot allowance is 100 MiB across the account, with 60-day media retention; this is not a paid-plan storage policy.

The older configured test-purchase path accepts the **FeedbackPress license key** generated for that product. Lemon Squeezy includes generated licenses in purchase receipts; see its [license guide](https://docs.lemonsqueezy.com/guides/tutorials/license-keys). Enter that license in the same WordPress field. The service validates it and connects the account; project management then stays in WordPress.

Do not enter a Lemon Squeezy merchant API key, a Resend key or a database password. Those are private service credentials. Keep your customer key in your password manager. WordPress exchanges it for a limited server-side account connection and does not save the submitted license/root access key or expose it to the public review script.

## One free project and upgrades

The service supports one free project indefinitely with 100 MB (100,000,000 bytes) of attachments and 60-day media retention. When free registration is enabled, **Start free** creates an account and displays its access key once; copy it into your password manager before continuing. Existing connections retain only limited manager/site credentials.

The $30/month unlimited-project upgrade keeps the same account key, projects and connections. The current hosted service offers an explicitly labelled **test checkout**, with public free registration and live billing still disabled. Existing complimentary owner accounts retain their earlier allowance; do not replace that key or assume an existing account has been changed to the free plan. Paid storage and expiry policy remain unresolved.

## Current access and billing

The hosted service accepts complimentary account keys and the configured FeedbackPress **test-mode** purchase license. Live billing remains disabled and the live product remains Draft. Paid/customer production use still needs the unresolved paid storage allowance, expired-subscription grace/read/export policy, live checkout/tax acceptance and operational recovery gates. Separate backup storage is explicitly deferred; independent off-server recovery is not claimed. The owner key is pilot access rather than proof of those production gates.

Mention autocomplete and shared image replies are available. Email verification is deferred until the owner participates, and mention delivery remains capture-only.


## Email notifications

In **Settings → FeedbackPress**, set **Project owner email** and select **Save email**. New projects use their creator’s WordPress administrator email. Leave it empty to turn summaries off. New tickets and shared comments from other people are grouped after ten minutes without further client comments; owner comments and private notes are excluded. The background worker normally sends within the following minute. Emails link to the issue and do not grant access.

### Notification links

Under **Settings → FeedbackPress → Sites in this project**, use **Notification link destination**. Automatic chooses the first connected public HTTPS copy. Choose a staging or production URL to override it, then **Save link destination**. This is shared across all copies of the project. Known local/private addresses are excluded using URL and DNS/IP checks; arbitrary words such as “staging” are not used to guess the preferred environment. If all copies are local, connect a public copy before notification links become available. Owner summaries use Resend when enabled by the service; other mention delivery remains separately controlled.

## Pause new client tickets

The subscription/account-key owner can use **Pause new client tickets** in the issue sidebar's bottom controls. The pause applies to every site in that project. Clients can still read issues, reply and attach files to existing tickets; only new client tickets are blocked. Owners can keep creating tickets, and existing private/agent-note access is unchanged. **Resume new client tickets** restores client creation. New projects start unpaused.

Account owners who connected before this feature can reconnect once in Settings → FeedbackPress using their existing subscription/account key. This verifies the current logged-in WordPress identity without a separate email field or changing the project connection. Saved site/manager credentials and an administrator role alone do not establish ownership.
