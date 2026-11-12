# Set up FeedbackPress in WordPress

You need the plugin ZIP, administrator access to WordPress, and your FeedbackPress customer key. No separate FeedbackPress website login is required for project management.

1. In WordPress, open **Plugins → Add Plugin → Upload Plugin**. Choose the ZIP, install it, then **Activate Plugin**.
2. Open **Settings → FeedbackPress**.
3. Paste your key into **License or account access key**, then select **Connect account**. The service address is already filled in; ordinary installations do not need to change it.
4. Choose a project by its name in the searchable **Project** field. If this is your first project, select **Create a project**, give it a label, then **Create project**. Creation also connects this installation.
5. **Sites in this project** lists every currently connected copy and marks **This site**. On another WordPress copy, install the same ZIP, enter the same customer key, and select the same project. Both copies then use the same central issues and media.
6. Open the site's front end to leave feedback. Under **Review access**, choose whether everyone or only logged-in administrators can review, or disable review on this copy.

Project selection, project creation, site removal and reconnection stay in this WordPress dashboard. Switching a copy to a different project changes that copy's membership; existing feedback stays with its original project. Removing a copy leaves other copies and feedback intact. A copied database can retain its connection, so deliberately choose a new project when repurposing an unrelated site.

## Which key?

For the current complimentary owner pilot, use the **FeedbackPress account access key** supplied privately by the service operator. It is independent of Lemon Squeezy and does not create a charge. The owner's explicit pilot allowance is 100 MiB across the account, with 60-day media retention; this is not a paid-plan storage policy.

The purchase path uses the **FeedbackPress license key** generated for the purchased product. Lemon Squeezy includes generated licenses in purchase receipts; see its [license guide](https://docs.lemonsqueezy.com/guides/tutorials/license-keys). Enter that license in the same WordPress field. The service validates it and connects the account; project management then stays in WordPress.

Do not enter a Lemon Squeezy merchant API key, a Resend key or a database password. Those are private service credentials. Keep your customer key in your password manager. WordPress exchanges it for a limited server-side account connection and does not save the submitted license/root access key or expose it to the public review script.

## Current pilot boundary

The hosted pilot accepts complimentary account keys and the configured FeedbackPress **test-mode** purchase license. Live billing remains disabled and the live product remains Draft. Paid/customer production use still needs the unresolved paid storage allowance, expired-subscription grace/read/export policy, live checkout/tax acceptance and operational recovery gates. Separate backup storage is explicitly deferred; independent off-server recovery is not claimed. The owner key is pilot access rather than proof of those production gates.

Mention autocomplete and shared image replies are available. Email verification is deferred until the owner participates, and mention delivery remains capture-only.
