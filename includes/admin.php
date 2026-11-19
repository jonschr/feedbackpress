<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Admin {
    public static function activate(bool $networkWide = false): void {
        wp_clear_scheduled_hook('feedbackpress_tick');
        if ($networkWide || is_network_admin() || wp_doing_ajax() || (defined('WP_CLI') && WP_CLI)
            || !current_user_can('manage_options') || !empty(Service::connection()['manager'])
            // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read native activation context only; WordPress performs activation authorization.
            || isset($_REQUEST['activate-multi']) || in_array('activate-selected', [$_REQUEST['action'] ?? '', $_REQUEST['action2'] ?? ''], true)) return;
        set_transient('feedbackpress_setup_redirect_' . get_current_user_id(), true, MINUTE_IN_SECONDS);
    }
    public static function activationRedirect(): void {
        if (is_network_admin() || wp_doing_ajax() || (defined('WP_CLI') && WP_CLI) || !current_user_can('manage_options')
            // phpcs:ignore WordPress.Security.NonceVerification -- Only suppress redirects on form/bulk requests; no submitted values are processed.
            || !empty($_POST) || isset($_REQUEST['activate-multi']) || in_array('activate-selected', [$_REQUEST['action'] ?? '', $_REQUEST['action2'] ?? ''], true)) return;
        $key = 'feedbackpress_setup_redirect_' . get_current_user_id();
        if (!get_transient($key)) return;
        delete_transient($key);
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Navigation context only; the redirect transient is scoped to this administrator.
        if (!empty(Service::connection()['manager']) || sanitize_key(wp_unslash($_GET['page'] ?? '')) === 'feedbackpress') return;
        if (!headers_sent() && wp_safe_redirect(admin_url('options-general.php?page=feedbackpress'))) exit;
    }
    public static function setupNotice(): void {
        if (is_network_admin() || !current_user_can('manage_options') || !empty(Service::connection()['manager'])) return;
        echo '<div class="notice notice-warning"><p><strong>License FeedbackPress to get started.</strong>';
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Determines notice placement only, without changing settings.
        if (sanitize_key(wp_unslash($_GET['page'] ?? '')) !== 'feedbackpress') echo ' <a class="button button-primary" href="' . esc_url(admin_url('options-general.php?page=feedbackpress')) . '">Set up FeedbackPress</a>';
        echo '</p></div>';
    }
    public static function pluginLinks(array $links): array {
        if (current_user_can('manage_options')) array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=feedbackpress')) . '">' . esc_html__('Settings') . '</a>');
        return $links;
    }
    public static function menu(): void { add_options_page('FeedbackPress', 'FeedbackPress', 'manage_options', 'feedbackpress', [self::class, 'page']); }
    public static function state(): array {
        try { $c = Service::ensureConnection(); } catch (RemoteError $e) { if ($e->remoteCode !== 'site_disconnected') throw $e; $c = Service::connection(); }
        if (empty($c['manager'])) return ['account_connected' => false, 'current_url' => Service::home()];
        $project = !empty($c['project']) ? Service::manager('GET', '/projects/' . $c['project']) : null;
        return ['account_connected' => true, 'current_url' => Service::home(), 'service' => $c['service'], 'project' => $project, 'notification_default_email' => wp_get_current_user()->user_email, 'disconnected' => !empty($c['disconnected'])];
    }
    public static function routes($route): void {
        $admin = fn() => current_user_can('manage_options') ? true : API::error('Administrator access required.', 403);
        $route('/admin/capabilities', 'GET', fn() => Service::capabilities(), $admin);
        $route('/admin/free', 'POST', fn() => Service::startFree(), $admin);
        $route('/admin/plan', 'GET', fn() => array_intersect_key(Service::manager('GET', '/account'), array_flip(['plan_kind','project_limit','storage_limit','allocated_bytes'])), $admin);
        $route('/admin/checkout', 'POST', fn() => Service::manager('POST', '/account/checkout', new \stdClass()), $admin);
        $route('/admin/connection', 'GET', fn() => self::state(), $admin);
        $route('/admin/account', 'POST', fn($r) => Service::connectAccount((string) $r->get_param('service'), (string) $r->get_param('key')), $admin);
        $route('/admin/projects', 'GET', fn() => Service::manager('GET', '/account')['projects'], $admin);
        $route('/admin/project', 'POST', function ($r) { Service::selectProject((string) $r->get_param('project')); return self::state(); }, $admin);
        $route('/admin/project/new', 'POST', function ($r) {
            $id = (string) $r->get_param('id'); if (!Service::uuid($id)) throw new \InvalidArgumentException('A project request ID is required.');
            Service::manager('POST', '/projects', ['id' => $id, 'name' => $r->get_param('name'), 'notification_email' => wp_get_current_user()->user_email]);
            Service::selectProject($id); return self::state();
        }, $admin);
        $route('/admin/site/remove', 'POST', function ($r) { Service::removeSite((string) $r->get_param('url')); return self::state(); }, $admin);
        $route('/admin/notifications', 'POST', function ($r) {
            $body = [];
            if ($r->has_param('review_site')) $body['review_site'] = $r->get_param('review_site');
            if ($r->has_param('notification_email')) $body['notification_email'] = $r->get_param('notification_email');
            $c = Service::connection(); Service::manager('POST', '/projects/' . $c['project'] . '/notifications', $body); return self::state();
        }, $admin);
        $route('/admin/shared-links', 'POST', function ($r) {
            $c = Service::connection();
            if ($r->get_param('project') !== ($c['project'] ?? null)) throw new \RuntimeException('The project changed. Reload before saving.', 409);
            Service::manager('POST', '/projects/' . $c['project'] . '/shared-links', ['create_accounts' => $r->get_param('create_accounts')]); return self::state();
        }, $admin);
        $route('/admin/shared-links/revoke', 'POST', function ($r) {
            $c = Service::connection();
            if ($r->get_param('project') !== ($c['project'] ?? null)) throw new \RuntimeException('The project changed. Reload before revoking links.', 409);
            return Service::manager('POST', '/projects/' . $c['project'] . '/shared-links/revoke', new \stdClass());
        }, $admin);
        $route('/admin/disconnect', 'POST', fn() => Service::disconnect(), $admin);
        $route('/admin/settings', 'POST', function ($r) {
            $mode = $r->get_param('mode'); if (!in_array($mode, ['everyone', 'admins', 'disabled'], true)) throw new \InvalidArgumentException('Choose a review access setting.');
            update_option('feedbackpress_settings', ['mode' => $mode], false); return ['saved' => true];
        }, $admin);
        $route('/admin/log', 'GET', fn() => Log::entries(), $admin);
    }
    public static function assets(string $hook): void {
        if ($hook !== 'settings_page_feedbackpress') return;
        $base = dirname(__DIR__) . '/feedbackpress.php';
        wp_enqueue_script('feedbackpress-admin', plugins_url('assets/admin.js', $base), [], VERSION . '.' . filemtime(dirname(__DIR__) . '/assets/admin.js'), true);
        wp_enqueue_style('feedbackpress-admin', plugins_url('assets/admin.css', $base), [], VERSION . '.' . filemtime(dirname(__DIR__) . '/assets/admin.css'));
        wp_localize_script('feedbackpress-admin', 'FeedbackPressAdmin', ['api' => rest_url('feedbackpress/v1/'), 'nonce' => wp_create_nonce('wp_rest'), 'project' => Service::connection()['project'] ?? null]);
    }
    private static function accountForm(): void {
        $c = Service::connection();
        ?>
        <form id="fp-account" method="post" autocomplete="off">
            <label for="fp-account-key">License or account access key</label>
            <input id="fp-account-key" name="feedbackpress_access_key" data-1p-ignore type="text" required autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
            <button class="button button-primary" type="submit">Connect account</button>
            <input id="fp-service" type="hidden" value="<?php echo esc_attr($c['service'] ?? 'https://feedbackpress.elod.in'); ?>">
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
            <?php // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Selects one of two fixed informational messages; no request value is output.
            if (isset($_GET['disconnected'])): ?><div class="notice inline notice-info"><p><?php echo $_GET['disconnected'] === 'unconfirmed' ? 'Account disconnected here. The service could not confirm removal; remove this URL from another connected site when it is available.' : 'This installation is disconnected. Your feedback remains in the service.'; ?></p></div><?php endif; ?>
            <section class="fp-section fp-main" id="fp-main">
            <?php if (!empty($c['manager'])): ?>
                <h2 id="fp-project-heading">Project</h2>
                <div id="fp-plan" hidden><p class="description" id="fp-plan-summary"></p><div class="fp-inline-actions"><button type="button" class="button" id="fp-upgrade" hidden>Upgrade — $30/month</button><button type="button" class="button-link" id="fp-check-plan">Refresh plan</button></div><p id="fp-checkout-link" hidden></p></div>
                <div id="fp-project-select">
                <div class="fp-project-choice">
                <div class="fp-project-picker" id="fp-project-picker" aria-busy="true">
                    <label for="fp-project-search" class="screen-reader-text">Project</label>
                    <div class="fp-select-wrap"><input id="fp-project-search" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="fp-project-options" autocomplete="off" data-1p-ignore placeholder="Choose an existing project…" disabled><span class="fp-select-chevron" aria-hidden="true"></span></div>
                    <ul id="fp-project-options" role="listbox" aria-label="Account projects" hidden></ul>
                </div>
                <span class="fp-project-or">or</span>
                <button type="button" class="button button-primary" id="fp-new-project">Create a project</button>
                </div>
                <p id="fp-project-state" class="description" aria-live="polite">Loading your projects…</p>
                </div>
                <form id="fp-create-project" method="post" hidden><label for="fp-project-name">Project name</label><input id="fp-project-name" type="text" placeholder="e.g. Website review" required maxlength="120" data-1p-ignore><div class="fp-inline-actions"><button class="button button-primary" type="submit">Create and connect</button><button class="button-link" type="button" id="fp-cancel-project">Cancel</button></div></form>
                <div id="fp-connected-sites" class="fp-subsection" hidden><h3>Connected sites</h3><p class="description">Choose a project to connect this site.</p></div>
            <?php else: ?>
                <h2>Start with one free project</h2><p class="description">100 MB of attachments. No time limit.</p>
                <button type="button" class="button button-primary" id="fp-start-free" hidden>Start free</button><p id="fp-free-state" class="description" hidden></p>
                <div id="fp-free-key-result" hidden><label for="fp-issued-key">Account access key</label><input type="text" id="fp-issued-key" readonly data-1p-ignore><div class="fp-inline-actions"><button type="button" class="button" id="fp-copy-issued-key">Copy key</button><button type="button" class="button button-primary" id="fp-key-saved">I've saved my key</button></div></div>
                <?php self::accountForm(); ?>
            <?php endif; ?>
            </section>
            <section class="fp-section">
                <h2>Review access</h2>
                <form id="fp-access" method="post"><label for="fp-mode">Access without a review link</label><div class="fp-field-actions"><select id="fp-mode" aria-describedby="fp-access-help"><?php foreach (['everyone' => 'Every visitor', 'admins' => 'Logged-in administrators', 'disabled' => 'Nobody (disabled)'] as $value => $label): ?><option value="<?php echo esc_attr($value); ?>" <?php selected(settings()['mode'], $value); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><button class="button" type="submit">Save access</button></div><p class="description" id="fp-access-help">Private notes require the owner’s WordPress login. Nobody also disables review links.</p></form>
                <div id="fp-shared-access" class="fp-subsection" hidden><h3>Shared access links</h3><p class="description">Links never expire and always open a public site. Revoking ends all existing link-based access for this project, including open review sessions.</p><button type="button" class="button" id="fp-revoke-links">Revoke all shared links</button><form id="fp-invitation-accounts" method="post"><label class="fp-check-label" for="fp-create-accounts"><input type="checkbox" id="fp-create-accounts"> Create WordPress accounts for invited reviewers</label><p class="description">Existing accounts are matched by email. When enabled, new invitees get a FeedbackPress-only account on their first visit. They can set a password at login.</p><button class="button" type="submit">Save invitation setting</button></form></div>
                <?php if (!empty($c['token'])): ?><p class="description"><a href="<?php echo esc_url(add_query_arg('feedbackpress', 'open', home_url('/'))); ?>">Open feedback to invite reviewers</a></p><?php endif; ?>
            </section>
            <?php if (!empty($c['manager'])): ?><details class="fp-section"><summary>Account connection</summary>
                <?php self::accountForm(); ?>
                <div class="fp-subsection"><p class="description">Disconnecting removes this installation from its project. All feedback stays in the service.</p><button class="button-link button-link-delete" id="fp-disconnect" type="button">Disconnect account</button></div>
            </details><?php endif; ?>
            <details class="fp-section" id="fp-diagnostics"><summary>Connection diagnostics</summary><p class="description">Latest 100 requests, kept for 3 days. Credentials and comment text are excluded.</p><pre id="fp-log">Open this section to load diagnostics.</pre></details>
        </div>
        <?php
    }
}
