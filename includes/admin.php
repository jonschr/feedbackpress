<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Admin {
    public static function menu(): void { add_options_page('FeedbackPress', 'FeedbackPress', 'manage_options', 'feedbackpress', [self::class, 'page']); }
    public static function routes($route): void {
        $admin = fn($r) => current_user_can('manage_options') ? true : API::error('Administrator access required.', 403);
        $route('/admin/connection', 'GET', function () {
            $c = Service::connection(); return $c ? Service::request('GET', '') + ['service' => $c['service']] : ['connected' => false];
        }, $admin);
        $route('/admin/code', 'POST', fn() => ['code' => 'fp2:' . Service::pack(Service::connection())], $admin);
        $route('/admin/connect', 'POST', fn($r) => Service::connect((string) $r->get_param('code')), $admin);
        $route('/admin/disconnect', 'POST', function () { delete_option(Service::OPTION); delete_transient('feedbackpress_activity_v2'); return ['disconnected' => true]; }, $admin);
        $route('/admin/projects', 'POST', function ($r) {
            $origin = Service::origin((string) $r->get_param('service'));
            return Service::http('GET', $origin . '/v1/account', (string) $r->get_param('account_key'));
        }, $admin);
        $route('/admin/project', 'POST', function ($r) {
            $origin = Service::origin((string) $r->get_param('service')); $key = (string) $r->get_param('account_key');
            $id = (string) $r->get_param('project');
            if (!$id) $id = wp_generate_uuid4();
            if (!Service::uuid($id)) throw new \InvalidArgumentException('Choose a project.');
            if ($r->get_param('name')) Service::http('POST', $origin . '/v1/projects', $key, ['id' => $id, 'name' => $r->get_param('name')]);
            $connection = Service::http('POST', $origin . '/v1/projects/' . $id . '/connections', $key, new \stdClass());
            return Service::connect('fp2:' . Service::pack(['v' => 2, 'service' => $origin, 'project' => $id, 'token' => $connection['token']]));
        }, $admin);
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
        wp_localize_script('feedbackpress-admin', 'FeedbackPressAdmin', ['api' => rest_url('feedbackpress/v1/'), 'nonce' => wp_create_nonce('wp_rest')]);
    }
    public static function page(): void {
        if (!current_user_can('manage_options')) return;
        $c = Service::connection();
        ?>
        <div class="wrap fp-settings">
            <h1>FeedbackPress</h1>
            <div id="fp-admin-message" class="notice inline" role="status" hidden><p></p></div>
            <section class="fp-section">
                <h2><?php echo $c ? 'Connected project' : 'Connect a project'; ?></h2>
                <?php if ($c): ?>
                    <p class="fp-project-name"><?php echo esc_html($c['name']); ?></p>
                    <p class="description">Feedback and media are saved to <?php echo esc_html($c['service']); ?>. Copies of this site use the same project automatically.</p>
                    <p><button type="button" class="button button-primary" id="fp-copy">Copy connection code</button></p>
                    <textarea id="fp-copy-fallback" rows="3" readonly aria-label="Connection code" hidden></textarea>
                    <p class="description">Paste this code into FeedbackPress on another WordPress installation to share this project. Keep it private: it grants project access.</p>
                    <div id="fp-connected-sites" aria-live="polite"></div>
                <?php else: ?>
                    <p>Connect this installation to the same project as your other sites.</p>
                    <form id="fp-connect"><label for="fp-code">Project connection code</label><textarea id="fp-code" rows="3" required placeholder="Paste the code from another installation" autocomplete="off" spellcheck="false"></textarea><button class="button button-primary" type="submit">Connect project</button></form>
                <?php endif; ?>
            </section>
            <details class="fp-section"><summary><?php echo $c ? 'Connect a different project' : 'Create or choose a project'; ?></summary>
                <p>Use your account access key to manage projects. This key is used for this session only; it is never stored in WordPress.</p>
                <form id="fp-account"><label for="fp-service">FeedbackPress service</label><input id="fp-service" type="url" required value="<?php echo esc_attr($c['service'] ?? 'https://feedbackpress.elod.in'); ?>"><label for="fp-account-key">Account access key</label><input id="fp-account-key" type="password" required autocomplete="off"><button class="button" type="submit">Load projects</button></form>
                <form id="fp-project" hidden><label for="fp-project-id">Project</label><select id="fp-project-id"><option value="">Create a new project</option></select><label for="fp-project-name">New project name</label><input id="fp-project-name" maxlength="120" value="<?php echo esc_attr(get_bloginfo('name')); ?>"><button class="button button-primary" type="submit">Connect project</button></form>
            </details>
            <details class="fp-section"><summary>Review access</summary>
                <form id="fp-access"><label for="fp-mode">Who can view pins and leave feedback on this installation?</label><select id="fp-mode"><?php foreach (['everyone' => 'Every visitor', 'admins' => 'Logged-in administrators', 'disabled' => 'Nobody (disabled)'] as $value => $label): ?><option value="<?php echo esc_attr($value); ?>" <?php selected(settings()['mode'], $value); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><button class="button" type="submit">Save access</button></form>
                <p class="description">Guests provide a name and email for attribution. Private agent notes are available only to logged-in WordPress users with the matching email address.</p>
            </details>
            <details class="fp-section" id="fp-diagnostics"><summary>Connection diagnostics</summary><p class="description">The latest 100 requests, retained for up to 3 days. No credentials or comment text are logged.</p><pre id="fp-log">Open this section to load diagnostics.</pre></details>
            <?php if ($c): ?><details class="fp-section"><summary>Disconnect this installation</summary><p>Disconnecting removes this copy’s credential. The project, other copies, and all feedback remain available in the central service.</p><button class="button" id="fp-disconnect" type="button">Disconnect project</button></details><?php endif; ?>
        </div>
        <?php
    }
}
