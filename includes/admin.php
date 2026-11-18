<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Admin {
    public static function activate(bool $networkWide = false): void {
        wp_clear_scheduled_hook('feedbackpress_tick');
        if ($networkWide || is_network_admin() || wp_doing_ajax() || (defined('WP_CLI') && WP_CLI)
            || !current_user_can('manage_options') || !empty(Service::connection()['manager'])
            || isset($_REQUEST['activate-multi']) || in_array('activate-selected', [$_REQUEST['action'] ?? '', $_REQUEST['action2'] ?? ''], true)) return;
        set_transient('feedbackpress_setup_redirect_' . get_current_user_id(), true, MINUTE_IN_SECONDS);
    }
    public static function activationRedirect(): void {
        if (is_network_admin() || wp_doing_ajax() || (defined('WP_CLI') && WP_CLI) || !current_user_can('manage_options')
            || !empty($_POST) || isset($_REQUEST['activate-multi']) || in_array('activate-selected', [$_REQUEST['action'] ?? '', $_REQUEST['action2'] ?? ''], true)) return;
        $key = 'feedbackpress_setup_redirect_' . get_current_user_id();
        if (!get_transient($key)) return;
        delete_transient($key);
        if (!empty(Service::connection()['manager']) || ($_GET['page'] ?? '') === 'feedbackpress') return;
        if (!headers_sent() && wp_safe_redirect(admin_url('options-general.php?page=feedbackpress'))) exit;
    }
    public static function setupNotice(): void {
        if (is_network_admin() || !current_user_can('manage_options') || !empty(Service::connection()['manager'])) return;
        echo '<div class="notice notice-warning"><p><strong>License FeedbackPress to get started.</strong>';
        if (($_GET['page'] ?? '') !== 'feedbackpress') echo ' <a class="button button-primary" href="' . esc_url(admin_url('options-general.php?page=feedbackpress')) . '">Set up FeedbackPress</a>';
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
            <?php if (isset($_GET['disconnected'])): ?><div class="notice inline notice-info"><p><?php echo $_GET['disconnected'] === 'unconfirmed' ? 'Account disconnected here. The service could not confirm removal; remove this URL from another connected site when it is available.' : 'This installation is disconnected. Your feedback remains in the service.'; ?></p></div><?php endif; ?>
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
                <?php if (!empty($c['manager']) || !empty($c['token'])): ?><div id="fp-review-links" class="fp-subsection" <?php if (empty($c['token'])) echo 'hidden'; ?>>
                    <h3>Invite a reviewer</h3>
                    <p class="description">Anyone with the magic link can view shared feedback.</p>
                    <form id="fp-invite" method="post"><label for="fp-invite-user">Reviewer</label>
                        <select id="fp-invite-user" required><option value="">Choose a site user…</option><?php foreach (get_users(['blog_id' => get_current_blog_id(), 'fields' => ['ID', 'display_name', 'user_email'], 'orderby' => 'display_name']) as $reviewer): ?><option value="<?php echo (int) $reviewer->ID; ?>"><?php echo esc_html($reviewer->display_name . ' — ' . $reviewer->user_email); ?></option><?php endforeach; ?><option value="custom">Use another email address…</option></select>
                        <div id="fp-invite-custom" class="fp-invite-custom" hidden><label for="fp-invite-email">Email address</label><input id="fp-invite-email" type="email" required disabled autocomplete="email"></div>
                        <div class="fp-field-actions">
                        <button type="submit" class="button button-primary" id="fp-invite-send" disabled>Send invitation</button>
                        <button type="button" class="button" id="fp-review-link-copy">Copy magic link</button>
                    </div></form><p id="fp-invite-state" class="description" hidden></p>
                    <div id="fp-review-link-result" hidden><label for="fp-review-link-url">Review link</label><input id="fp-review-link-url" readonly autocomplete="off" data-1p-ignore></div>
                </div><?php endif; ?>
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
