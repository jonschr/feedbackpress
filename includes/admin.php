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
            Network::configure((string) wp_unslash($_POST['network_name'] ?? ''), array_values($rows), (string) ($_POST['revision'] ?? ''));
            update_option('feedbackpress_settings', $s, false);
            self::redirect();
        } catch (\Throwable $e) { wp_die(esc_html($e->getMessage())); }
    }
    public static function network(): void {
        self::authorize();
        try {
            if (($_POST['network_action'] ?? '') === 'create') {
                Network::create((string) wp_unslash($_POST['new_name'] ?? ''));
                $s = get_option('feedbackpress_settings', []) + defaults(); $s['secret'] = bin2hex(random_bytes(32)); update_option('feedbackpress_settings', $s, false);
            } elseif (($_POST['network_action'] ?? '') === 'join') Network::join((string) wp_unslash($_POST['join_code'] ?? ''), (string) ($_POST['join_type'] ?? ''));
            else throw new \InvalidArgumentException('Unknown network action.');
            self::redirect();
        } catch (\Throwable $e) { wp_die(esc_html($e->getMessage())); }
    }
    public static function sync(): void { self::authorize(); Sync::run(); self::redirect(); }
    public static function assets(string $hook): void {
        if ($hook !== 'settings_page_feedbackpress') return;
        wp_enqueue_script('feedbackpress-admin', plugins_url('assets/admin.js', dirname(__DIR__) . '/feedbackpress.php'), [], VERSION, true);
        wp_localize_script('feedbackpress-admin', 'FeedbackPressAdmin', ['api' => rest_url('feedbackpress/v1/'), 'nonce' => wp_create_nonce('wp_rest')]);
    }
    private static function fields(): void { echo '<input type="hidden" name="action" value="feedbackpress_network">'; wp_nonce_field('feedbackpress_settings'); }
    private static function row(array $peer, string $key): void {
        $name = 'peers[' . $key . ']';
        ?>
        <tr class="fp-peer-row">
            <td><input type="hidden" name="<?php echo esc_attr($name); ?>[id]" value="<?php echo esc_attr($peer['id'] ?? ''); ?>"><input aria-label="Environment label" name="<?php echo esc_attr($name); ?>[label]" value="<?php echo esc_attr($peer['label'] ?? ''); ?>" placeholder="Optional label"></td>
            <td><input class="regular-text" aria-label="Environment URL" type="url" required name="<?php echo esc_attr($name); ?>[url]" value="<?php echo esc_attr($peer['url'] ?? ''); ?>" placeholder="https://site.example"></td>
            <?php if ($peer['type'] === 'remote'): ?><td><input aria-label="Basic Auth username" autocomplete="off" name="<?php echo esc_attr($name); ?>[basic_user]" value="<?php echo esc_attr($peer['basic_user'] ?? ''); ?>" placeholder="Basic Auth username"><input aria-label="Basic Auth password" type="password" autocomplete="new-password" name="<?php echo esc_attr($name); ?>[basic_password]" value="<?php echo esc_attr($peer['basic_password'] ?? ''); ?>" placeholder="Basic Auth password"></td><?php endif; ?>
            <td><select aria-label="Connection type" name="<?php echo esc_attr($name); ?>[type]"><?php foreach (['local' => 'Local', 'remote' => 'Remote'] as $type => $label): ?><option value="<?php echo esc_attr($type); ?>" <?php selected($peer['type'], $type); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select> <?php echo empty($peer['token_hash']) ? '<small>Not joined</small>' : '<small>Joined</small>'; ?><?php if ($peer['type'] === 'remote' && Store::uuid($peer['id'] ?? null) && ($peer['url'] ?? '') !== Network::home()): ?><button type="button" class="button fp-provision-peer" data-peer="<?php echo esc_attr($peer['id']); ?>" title="Copy a URL-bound setup code after a database copy. Rotates this remote’s connection credential.">Reconnect</button><?php endif; ?><button class="button-link-delete fp-remove-peer" type="button">Remove</button></td>
        </tr>
        <?php
    }
    public static function page(): void {
        if (!current_user_can('manage_options')) return;
        $s = settings(); $view = Network::view(); $self = Network::self();
        ?>
        <div class="wrap" style="max-width:1100px">
            <h1>FeedbackPress</h1>
            <?php if (!wp_mkdir_p(Store::directory()) || !is_writable(Store::directory())): ?><div class="notice notice-error"><p>Private attachment storage is not writable. Check the directory permissions before uploading files.</p></div><?php endif; ?>
            <?php if (!$self): ?><div class="notice notice-warning"><p>This URL is not connected with this installation’s credentials. Join the network below to enable feedback and synchronization.</p></div><?php endif; ?>
            <?php if ($view['conflicts']): ?><div class="notice notice-warning"><p>Network configuration has competing edits. Conflicted environments are disconnected until an administrator resolves them. Copy fresh setup from a connected member, or restore the intended environment entries and save.</p></div><?php endif; ?>
            <?php if (isset($_GET['saved'])): ?><div class="notice notice-success"><p>Settings saved.</p></div><?php endif; ?>
            <p><a class="button" href="<?php echo esc_url(home_url('/?feedbackpress=open')); ?>">Open site feedback</a></p>
            <p>This installation: <strong><?php echo esc_html(Network::home()); ?></strong><?php if ($self): ?> — <?php echo esc_html(ucfirst($self['type'])); ?><?php endif; ?></p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="feedbackpress_save"><?php wp_nonce_field('feedbackpress_settings'); ?>
                <input type="hidden" name="revision" value="<?php echo esc_attr($view['revision']); ?>">
                <h2>Review access</h2>
                <table class="form-table"><tr><th><label for="fp-mode">Who can review?</label></th><td><select id="fp-mode" name="mode"><?php foreach (['everyone' => 'Everyone', 'admins' => 'Logged-in administrators', 'disabled' => 'Disabled'] as $value => $label): ?><option value="<?php echo esc_attr($value); ?>" <?php selected($s['mode'], $value); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><p class="description">Access applies to this installation. Network synchronization remains available to authenticated members when the overlay is disabled.</p></td></tr>
                <tr><th><label for="fp-retention">Attachment retention</label></th><td><input id="fp-retention" type="number" min="1" max="3650" name="retention" value="<?php echo (int) $s['retention']; ?>"> days</td></tr></table>
                <h2>Network</h2>
                <p><label for="fp-network-name">Network name</label> <input id="fp-network-name" name="network_name" maxlength="120" required value="<?php echo esc_attr($view['name']); ?>"> <small>ID: <?php echo esc_html($view['id']); ?></small></p>
                <p>The URL lists determine which installation this is. Local sites initiate exchanges; remote sites can also receive them. URLs and configuration history are encoded to survive normal migration find-and-replace. Remote credentials are shared privately between connected installations.</p>
                <?php foreach (['local' => 'Local installations', 'remote' => 'Remote installations'] as $type => $label): ?>
                    <h3><?php echo esc_html($label); ?></h3>
                    <div style="overflow-x:auto"><table class="widefat striped fp-peer-table" data-peer-type="<?php echo esc_attr($type); ?>"><thead><tr><th>Label</th><th>URL</th><?php if ($type === 'remote'): ?><th>Optional Basic Auth</th><?php endif; ?><th>Membership</th></tr></thead><tbody><?php foreach ($view['peers'] as $peer) if ($peer['type'] === $type) self::row($peer, $peer['id']); ?></tbody></table></div>
                    <p><button class="button fp-add-peer" type="button" data-peer-type="<?php echo esc_attr($type); ?>">Add <?php echo esc_html($type); ?> URL</button></p>
                    <template id="fp-peer-<?php echo esc_attr($type); ?>"><?php self::row(['type' => $type], '__KEY__'); ?></template>
                <?php endforeach; ?>
                <p class="description">Change a URL’s connection type and save to move it between lists. Removing a joined entry revokes its incoming access as the configuration change reaches each peer. A new URL must join before it can exchange feedback. Reconnect rotates an existing remote’s credential and copies a repair code to paste at that URL.</p>
                <?php submit_button('Save settings'); ?>
            </form>
            <hr><h2>Connect another installation</h2>
            <p>Copy a setup code and paste it on the installation joining this network. To connect the first remote from a local-only network, add and save that remote URL above first; its initial code works only at that URL. Save hosting Basic Auth credentials before copying. Setup codes expire after 24 hours; treat them as passwords.</p>
            <button type="button" class="button" id="fp-copy-network">Copy network setup</button><p id="fp-copy-status" role="status"></p><textarea id="fp-network-code" readonly hidden rows="4" style="width:100%" aria-label="Network setup code"></textarea>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php self::fields(); ?><input type="hidden" name="network_action" value="join">
                <p><label for="fp-join-code">Network setup code</label><br><textarea id="fp-join-code" name="join_code" rows="3" required autocomplete="off" spellcheck="false" style="width:100%;max-width:750px"></textarea></p>
                <p>Register this URL as <label><input type="radio" name="join_type" value="local" <?php checked(Network::suggested_type(Network::home()), 'local'); ?>> Local</label> <label><input type="radio" name="join_type" value="remote" <?php checked(Network::suggested_type(Network::home()), 'remote'); ?>> Remote</label></p>
                <?php submit_button('Join network', 'secondary'); ?>
            </form>
            <details><summary>Create a separate network</summary><p>Starts a blank feedback workspace with new credentials. Previous network feedback stays stored separately.</p><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php self::fields(); ?><input type="hidden" name="network_action" value="create"><input aria-label="New network name" name="new_name" maxlength="120" required placeholder="New network name"><?php submit_button('Create new network', 'secondary'); ?></form></details>
            <hr><h2>Synchronization</h2><p>Activity-triggered, at most once per 60 seconds on this installation. No recurring feedback sync cron job. Checks pause when review activity stops or the browser tab is hidden.</p>
            <button class="button" id="fp-sync-now" type="button">Sync now</button> <span id="fp-sync-status" role="status"></span>
            <h3>Recent sync log</h3><p>Last 100 entries, up to 64 KB, retained for at most three days. Credentials and response bodies are never logged. Read locally with <code>wp feedbackpress sync-log</code>.</p>
            <pre id="fp-sync-log" style="max-height:300px;overflow:auto;background:#fff;padding:12px"><?php echo esc_html(wp_json_encode(Log::entries(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); ?></pre>
            <h2>Agent API</h2><p><label for="fp-agent-key">This installation’s agent API key</label> <input id="fp-agent-key" type="password" readonly class="regular-text" value="<?php echo esc_attr($s['secret']); ?>" autocomplete="off"><button type="button" class="button" id="fp-show-agent-key">Show key</button></p><p>Base URL: <code><?php echo esc_html(rest_url('feedbackpress/v1/')); ?></code>. See <code>docs/USAGE.md</code> for authentication and API details.</p>
        </div>
        <?php
    }
}
