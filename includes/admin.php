<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Admin {
    public static function menu(): void { add_options_page('FeedbackPress', 'FeedbackPress', 'manage_options', 'feedbackpress', [self::class, 'page']); }
    public static function state(): array {
        try { $c = Service::ensureConnection(); } catch (RemoteError $e) { if ($e->remoteCode !== 'site_disconnected') throw $e; $c = Service::connection(); }
        if (empty($c['manager'])) return ['account_connected' => false, 'current_url' => Service::home()];
        $project = !empty($c['project']) ? Service::manager('GET', '/projects/' . $c['project']) : null;
        return ['account_connected' => true, 'current_url' => Service::home(), 'service' => $c['service'], 'project' => $project, 'disconnected' => !empty($c['disconnected'])];
    }
    public static function routes($route): void {
        $admin = fn() => current_user_can('manage_options') ? true : API::error('Administrator access required.', 403);
        $route('/admin/connection', 'GET', fn() => self::state(), $admin);
        $route('/admin/account', 'POST', fn($r) => Service::connectAccount((string) $r->get_param('service'), (string) $r->get_param('key')), $admin);
        $route('/admin/projects', 'GET', fn() => Service::manager('GET', '/account')['projects'], $admin);
        $route('/admin/project', 'POST', function ($r) { Service::selectProject((string) $r->get_param('project')); return self::state(); }, $admin);
        $route('/admin/project/new', 'POST', function ($r) {
            $id = (string) $r->get_param('id'); if (!Service::uuid($id)) throw new \InvalidArgumentException('A project request ID is required.');
            Service::manager('POST', '/projects', ['id' => $id, 'name' => $r->get_param('name')]);
            Service::selectProject($id); return self::state();
        }, $admin);
        $route('/admin/site/remove', 'POST', function ($r) { Service::removeSite((string) $r->get_param('url')); return self::state(); }, $admin);
        $route('/admin/notifications', 'POST', function ($r) {
            $c = Service::connection(); Service::manager('POST', '/projects/' . $c['project'] . '/notifications', ['review_site' => $r->get_param('review_site')]); return self::state();
        }, $admin);
        $route('/admin/disconnect', 'POST', fn() => Service::disconnect(), $admin);
        $route('/admin/settings', 'POST', function ($r) {
            $mode = $r->get_param('mode'); if (!in_array($mode, ['everyone', 'admins', 'disabled'], true)) throw new \InvalidArgumentException('Choose a review access setting.');
            $sharing = $r->get_param('link_sharing') ?? settings()['link_sharing'];
            if (!in_array($sharing, ['admins', 'everyone'], true)) throw new \InvalidArgumentException('Choose who can create review links.');
            update_option('feedbackpress_settings', ['mode' => $mode, 'link_sharing' => $sharing], false); return ['saved' => true];
        }, $admin);
        $route('/admin/log', 'GET', fn() => Log::entries(), $admin);
    }
    public static function assets(string $hook): void {
        if ($hook !== 'settings_page_feedbackpress') return;
        $base = dirname(__DIR__) . '/feedbackpress.php';
        wp_enqueue_script('feedbackpress-admin', plugins_url('assets/admin.js', $base), [], VERSION . '.' . filemtime(dirname(__DIR__) . '/assets/admin.js'), true);
        wp_enqueue_style('feedbackpress-admin', plugins_url('assets/admin.css', $base), [], VERSION . '.' . filemtime(dirname(__DIR__) . '/assets/admin.css'));
        wp_localize_script('feedbackpress-admin', 'FeedbackPressAdmin', ['api' => rest_url('feedbackpress/v1/'), 'nonce' => wp_create_nonce('wp_rest')]);
    }
    private static function accountForm(): void {
        $c = Service::connection();
        ?>
        <form id="fp-account" method="post" autocomplete="off">
            <label for="fp-account-key">License or account access key</label><input id="fp-account-key" name="feedbackpress_access_key" data-1p-ignore type="password" required autocomplete="off" spellcheck="false">
            <button class="button button-primary" type="submit">Connect account</button>
            <details class="fp-service-details"><summary>Service address</summary><label for="fp-service" class="screen-reader-text">FeedbackPress service</label><input id="fp-service" type="url" required value="<?php echo esc_attr($c['service'] ?? 'https://feedbackpress.elod.in'); ?>"></details>
        </form>
        <?php
    }
    public static function page(): void {
        if (!current_user_can('manage_options')) return;
        $c = Service::connection();
        ?>
        <div class="wrap fp-settings">
            <h1>FeedbackPress</h1>
            <div id="fp-admin-message" class="notice inline" role="status" hidden><p></p></div>
            <?php if (isset($_GET['disconnected'])): ?><div class="notice inline notice-info"><p><?php echo $_GET['disconnected'] === 'unconfirmed' ? 'Account disconnected here. The service could not confirm removal; remove this URL from another connected site when it is available.' : 'This installation is disconnected. Your feedback remains in the service.'; ?></p></div><?php endif; ?>
            <section class="fp-section fp-main" id="fp-main">
            <?php if (!empty($c['manager'])): ?>
                <h2>Project</h2>
                <p class="description">Choose which project this site belongs to. Feedback stays with its project when you switch.</p>
                <div class="fp-project-picker" id="fp-project-picker" aria-busy="true">
                    <label for="fp-project-search">Project</label>
                    <div class="fp-select-wrap"><input id="fp-project-search" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="fp-project-options" autocomplete="off" data-1p-ignore placeholder="Search your projects…" disabled><span class="fp-select-chevron" aria-hidden="true"></span></div>
                    <ul id="fp-project-options" role="listbox" aria-label="Account projects" hidden></ul>
                </div>
                <p id="fp-project-state" class="description" aria-live="polite">Loading your projects…</p>
                <button type="button" class="button-link" id="fp-new-project">Create a project</button>
                <form id="fp-create-project" method="post" hidden><label for="fp-project-name">Project name</label><input id="fp-project-name" required maxlength="120" data-1p-ignore><div class="fp-inline-actions"><button class="button" type="submit">Create project</button><button class="button-link" type="button" id="fp-cancel-project">Cancel</button></div></form>
                <div id="fp-connected-sites"><h3>Sites in this project</h3><p class="description">Choose a project to connect this site.</p></div>
            <?php else: ?>
                <h2>Connect your account</h2>
                <p>Enter your FeedbackPress license to choose a project. Complimentary accounts can use an access key.</p>
                <?php self::accountForm(); ?>
                <p class="description">Your license key is never saved in WordPress. A private account connection stays on the server so you can manage projects here.</p>
            <?php endif; ?>
            </section>
            <?php if (!empty($c['manager'])): ?><details class="fp-section"><summary>Account connection</summary><p class="description">Connected to <?php echo esc_html($c['service']); ?>. WordPress administrators on this installation can manage projects in this account.</p><p class="description">Use a license or account key to reconnect or choose another account. Neither key is saved in WordPress.</p><?php self::accountForm(); ?></details><?php endif; ?>
            <details class="fp-section"><summary>Review access</summary>
                <form id="fp-access" method="post"><label for="fp-mode">Who can view pins and leave feedback without a review link?</label><select id="fp-mode"><?php foreach (['everyone' => 'Every visitor', 'admins' => 'Logged-in administrators', 'disabled' => 'Nobody (disabled)'] as $value => $label): ?><option value="<?php echo esc_attr($value); ?>" <?php selected(settings()['mode'], $value); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><label for="fp-link-sharing">Who can create review links?</label><select id="fp-link-sharing"><?php foreach (['admins' => 'Administrators only', 'everyone' => 'Everyone with review access'] as $value => $label): ?><option value="<?php echo esc_attr($value); ?>" <?php selected(settings()['link_sharing'], $value); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><button class="button" type="submit">Save access</button></form>
                <p class="description">Private agent notes are available only to logged-in WordPress users with the matching email address.</p>
                <p class="description">Everyone with review access lets existing reviewers invite others with their own links. Administrators can revoke any link.</p>
            </details>
            <details class="fp-section" id="fp-review-links"><summary>Client review links</summary>
                <p class="description">Create links on the live or staging copy your client can reach. Each link unlocks only this site.</p>
                <p class="description">Give a client access to shared feedback without a WordPress login. Links work with administrator-only review access; Nobody (disabled) also disables links. Anyone holding a link can use it until it expires or you revoke it. Private notes and WordPress administration stay protected.</p>
                <form id="fp-review-link-create"><label for="fp-review-link-label">Link label</label><input id="fp-review-link-label" required maxlength="120" placeholder="Client review"><label for="fp-review-link-days">Expires after</label><select id="fp-review-link-days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select><button type="submit" class="button">Create review link</button></form>
                <div id="fp-review-link-result" hidden><label for="fp-review-link-url">New review link — copy before closing this page</label><input id="fp-review-link-url" readonly autocomplete="off" data-1p-ignore><button class="button" type="button" id="fp-review-link-copy">Copy link</button></div>
                <ul id="fp-review-link-list" class="fp-site-list"><li>Open this section to load existing links.</li></ul>
            </details>
            <details class="fp-section" id="fp-diagnostics"><summary>Connection diagnostics</summary><p class="description">The latest 100 requests, retained for up to 3 days. No credentials or comment text are logged.</p><pre id="fp-log">Open this section to load diagnostics.</pre></details>
            <?php if (!empty($c['manager'])): ?><details class="fp-section"><summary>Disconnect this installation</summary><p>This removes this copy from its project and disconnects its account. Other copies and all feedback remain in the service.</p><button class="button" id="fp-disconnect" type="button">Disconnect account</button></details><?php endif; ?>
        </div>
        <?php
    }
}
