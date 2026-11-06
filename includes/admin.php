<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Admin {
    public static function menu(): void { add_options_page('FeedbackPress', 'FeedbackPress', 'manage_options', 'feedbackpress', [self::class, 'page']); }
    private static function authorize(): void { if (!current_user_can('manage_options')) wp_die('Administrator access required.'); check_admin_referer('feedbackpress_settings'); }
    private static function redirect(): void { wp_safe_redirect(admin_url('options-general.php?page=feedbackpress&saved=1')); exit; }
    public static function save(): void {
        self::authorize();
        try {
            $s = get_option('feedbackpress_settings', []) + defaults();
            $s['mode'] = in_array($_POST['mode'] ?? '', ['everyone', 'admins', 'disabled'], true) ? $_POST['mode'] : 'disabled';
            $s['retention'] = max(1, min(3650, (int) ($_POST['retention'] ?? 90)));
            $rows = wp_unslash($_POST['peers'] ?? []);
            if (!is_array($rows)) throw new \InvalidArgumentException('Invalid environment entries.');
            Network::configure(Network::view()['name'], array_values($rows), (string) ($_POST['revision'] ?? ''));
            update_option('feedbackpress_settings', $s, false);
            self::redirect();
        } catch (\Throwable $e) { wp_die(esc_html($e->getMessage())); }
    }
    public static function network(): void {
        self::authorize();
        try {
            if (($_POST['network_action'] ?? '') === 'reset') {
                Network::create('FeedbackPress network');
                $s = get_option('feedbackpress_settings', []) + defaults(); $s['secret'] = bin2hex(random_bytes(32)); update_option('feedbackpress_settings', $s, false);
            } elseif (($_POST['network_action'] ?? '') === 'join') Network::join((string) wp_unslash($_POST['join_code'] ?? ''), (string) ($_POST['join_type'] ?? ''));
            else throw new \InvalidArgumentException('Unknown network action.');
            self::redirect();
        } catch (\Throwable $e) { wp_die(esc_html($e->getMessage())); }
    }
    public static function assets(string $hook): void {
        if ($hook !== 'settings_page_feedbackpress') return;
        wp_enqueue_script('feedbackpress-admin', plugins_url('assets/admin.js', dirname(__DIR__) . '/feedbackpress.php'), [], VERSION, true);
        wp_enqueue_style('feedbackpress-admin', plugins_url('assets/admin.css', dirname(__DIR__) . '/feedbackpress.php'), [], VERSION);
        wp_localize_script('feedbackpress-admin', 'FeedbackPressAdmin', ['api' => rest_url('feedbackpress/v1/'), 'nonce' => wp_create_nonce('wp_rest')]);
    }
    private static function fields(): void { echo '<input type="hidden" name="action" value="feedbackpress_network">'; wp_nonce_field('feedbackpress_settings'); }
    private static function row(array $peer, string $key): void {
        $name = 'peers[' . $key . ']'; $current = ($peer['url'] ?? '') === Network::home();
        ?>
        <div class="fp-site">
            <input type="hidden" name="<?php echo esc_attr($name); ?>[id]" value="<?php echo esc_attr($peer['id'] ?? ''); ?>">
            <input type="hidden" name="<?php echo esc_attr($name); ?>[label]" value="<?php echo esc_attr($peer['label'] ?? ''); ?>">
            <div class="fp-site-fields">
                <label class="screen-reader-text">Site URL</label><input class="fp-site-url" aria-label="Site URL" type="url" required name="<?php echo esc_attr($name); ?>[url]" value="<?php echo esc_attr($peer['url'] ?? ''); ?>" placeholder="https://site.example">
                <select aria-label="Site type" class="fp-site-type" name="<?php echo esc_attr($name); ?>[type]"><?php foreach (['remote' => 'Remote', 'local' => 'Local'] as $type => $label): ?><option value="<?php echo esc_attr($type); ?>" <?php selected($peer['type'], $type); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select>
                <?php if (!$current): ?><button class="button-link-delete fp-remove-peer" type="button">Remove</button><?php endif; ?>
            </div>
            <div class="fp-site-meta"><?php echo $current ? 'This site' : (empty($peer['token_hash']) ? 'Ready to connect' : 'Connected'); ?><?php if (!$current && $peer['type'] === 'remote' && Store::uuid($peer['id'] ?? null)): ?> · <button type="button" class="button-link fp-provision-peer" data-peer="<?php echo esc_attr($peer['id']); ?>">Copy reconnect code</button><?php endif; ?></div>
            <details class="fp-basic-auth" <?php if ($peer['type'] === 'local') echo 'hidden'; ?>><summary>Hosting password protection</summary><p class="description">Only needed if this host requires HTTP Basic Auth.</p><div class="fp-credentials"><label>Username<input autocomplete="off" name="<?php echo esc_attr($name); ?>[basic_user]" value="<?php echo esc_attr($peer['basic_user'] ?? ''); ?>"></label><label>Password<input type="password" autocomplete="new-password" name="<?php echo esc_attr($name); ?>[basic_password]" value="<?php echo esc_attr($peer['basic_password'] ?? ''); ?>"></label></div></details>
        </div>
        <?php
    }
    public static function page(): void {
        if (!current_user_can('manage_options')) return;
        $s = settings(); $view = Network::view(); $self = Network::self();
        ?>
        <div class="wrap fp-settings">
            <div class="fp-page-heading"><h1>FeedbackPress</h1><a href="<?php echo esc_url(home_url('/?feedbackpress=open')); ?>">Open site feedback</a></div>
            <?php if (!$self): ?><div class="notice notice-warning"><p>This copy needs to reconnect. Paste a connection code below, or disconnect to start fresh at this URL.</p></div><?php endif; ?>
            <?php if ($view['conflicts']): ?><div class="notice notice-warning"><p>Site settings have competing changes. Reconnect from a connected site or save the intended site list below.</p></div><?php endif; ?>
            <?php if (isset($_GET['saved'])): ?><div class="notice notice-success is-dismissible"><p>Changes saved.</p></div><?php endif; ?>
            <section class="fp-connect" aria-labelledby="fp-connect-title">
                <h2 id="fp-connect-title">Connect your sites</h2>
                <p>Share feedback between copies of this website. Copy a code here and paste it on the other WordPress installation.</p>
                <div class="fp-connect-options">
                    <div><h3>Add another site</h3><p>Take this site’s connection code to the other installation.</p><button type="button" class="button button-primary button-hero" id="fp-copy-network">Copy connection code</button></div>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                        <?php self::fields(); ?><input type="hidden" name="network_action" value="join">
                        <h3>Have a code already?</h3><label class="screen-reader-text" for="fp-join-code">Connection code</label><textarea id="fp-join-code" name="join_code" rows="3" required autocomplete="off" spellcheck="false" placeholder="Paste the code from your other site"></textarea>
                        <div class="fp-join-actions"><button type="submit" class="button button-secondary">Connect this site</button><label class="fp-join-type" hidden>This site is <select name="join_type"><?php foreach (['local' => 'Local', 'remote' => 'Remote'] as $type => $label): ?><option value="<?php echo esc_attr($type); ?>" <?php selected($self['type'] ?? Network::suggested_type(Network::home()), $type); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select></label></div>
                    </form>
                </div>
                <p id="fp-copy-status" role="status" class="fp-copy-status"></p><textarea id="fp-network-code" readonly hidden rows="3" aria-label="Connection code to copy"></textarea>
                <?php if ($self && $self['type'] === 'local' && !array_filter($view['peers'], fn($peer) => $peer['type'] === 'remote')): ?><p class="fp-first-remote">Starting locally? Add your first remote URL below and save, then copy its connection code.</p><?php endif; ?>
            </section>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="feedbackpress_save"><?php wp_nonce_field('feedbackpress_settings'); ?><input type="hidden" name="revision" value="<?php echo esc_attr($view['revision']); ?>">
                <section class="fp-sites" aria-labelledby="fp-sites-title"><h2 id="fp-sites-title">Sites in this connection</h2><p class="description">Local copies connect out to remote sites. Remote sites can also receive connections.</p>
                    <div id="fp-sites"><?php foreach ($view['peers'] as $peer) self::row($peer, $peer['id']); ?></div>
                    <button class="button fp-add-peer" type="button">Add site</button><template id="fp-peer-template"><?php self::row(['type' => 'remote'], '__KEY__'); ?></template>
                </section>
                <details class="fp-secondary"><summary>Review settings</summary>
                    <table class="form-table"><tr><th><label for="fp-mode">Who can review?</label></th><td><select id="fp-mode" name="mode"><?php foreach (['everyone' => 'Everyone', 'admins' => 'Logged-in administrators', 'disabled' => 'Disabled'] as $value => $label): ?><option value="<?php echo esc_attr($value); ?>" <?php selected($s['mode'], $value); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><p class="description">Applies only to this installation.</p></td></tr><tr><th><label for="fp-retention">Keep attachments for</label></th><td><input id="fp-retention" type="number" min="1" max="3650" name="retention" value="<?php echo (int) $s['retention']; ?>"> days</td></tr></table>
                </details>
                <?php submit_button('Save changes'); ?>
            </form>
            <details class="fp-secondary"><summary>Connection diagnostics</summary><p>Sync runs automatically during review activity, at most once per minute. Checks pause when the tab is hidden or review activity stops.</p><p id="fp-sync-status" role="status"></p><p class="description">Recent results only: up to 100 entries, 64 KB, and three days. No passwords or response bodies. Also available with <code>wp feedbackpress sync-log</code>.</p><pre id="fp-sync-log"><?php echo esc_html(wp_json_encode(Log::entries(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); ?></pre><?php if (!is_writable(Store::directory())): ?><p>Private attachment storage is not writable. Check directory permissions.</p><?php endif; ?></details>
            <details class="fp-secondary"><summary>Agent API</summary><p><label for="fp-agent-key">This site’s API key</label></p><input id="fp-agent-key" type="password" readonly class="regular-text" value="<?php echo esc_attr($s['secret']); ?>" autocomplete="off"> <button type="button" class="button" id="fp-show-agent-key">Show key</button><p>API URL: <code><?php echo esc_html(rest_url('feedbackpress/v1/')); ?></code></p></details>
            <details class="fp-secondary fp-disconnect"><summary>Disconnect this site</summary><p>Reset this installation to <strong><?php echo esc_html(Network::home()); ?></strong> and stop sharing with the other sites. Previous feedback stays stored separately. You can reconnect later using a new code.</p><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php self::fields(); ?><input type="hidden" name="network_action" value="reset"><button class="button" type="submit">Reset URL and disconnect</button></form></details>
        </div>
        <?php
    }
}
