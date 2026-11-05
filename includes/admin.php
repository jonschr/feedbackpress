<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Admin {
    public static function menu(): void { add_options_page('FeedbackPress', 'FeedbackPress', 'manage_options', 'feedbackpress', [self::class, 'page']); }
    private static function authorize(): void { if (!current_user_can('manage_options')) wp_die('Administrator access required.'); check_admin_referer('feedbackpress_settings'); }
    public static function save(): void {
        self::authorize(); $old = settings(); $s = $old;
        $s['mode'] = in_array($_POST['mode'] ?? '', ['everyone', 'admins', 'disabled'], true) ? $_POST['mode'] : 'disabled';
        $s['environment'] = in_array($_POST['environment'] ?? '', ['production', 'staging', 'local'], true) ? $_POST['environment'] : 'local';
        foreach (['production', 'staging', 'local'] as $env) {
            $url = untrailingslashit(esc_url_raw(wp_unslash($_POST[$env] ?? '')));
            if ($url) {
                $p = wp_parse_url($url);
                if (!$p || empty($p['host']) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment']) || !in_array($p['scheme'] ?? '', $env === 'local' ? ['http', 'https'] : ['https'], true)) wp_die('Use HTTPS site URLs, with no credentials, query, or fragment. HTTP is allowed only for Local.');
            }
            $s[$env] = $url;
        }
        $home = untrailingslashit(home_url());
        if ($s[$s['environment']] !== $home) wp_die('The selected environment URL must match this installation: ' . esc_html($home));
        if (count(array_filter([$s['production'], $s['staging'], $s['local']])) !== count(array_unique(array_filter([$s['production'], $s['staging'], $s['local']])))) wp_die('Each environment must have a different URL.');
        $project = sanitize_text_field(wp_unslash($_POST['project'] ?? ''));
        $secret = wp_unslash($_POST['secret'] ?? '');
        if (!Store::uuid($project) || !preg_match('/^[a-f0-9]{64}$/D', $secret)) wp_die('Use the generated project UUID and 64-character hexadecimal sync key.');
        $s['project'] = $project; $s['secret'] = $secret;
        $s['retention'] = max(1, min(3650, (int) ($_POST['retention'] ?? 90)));
        $s['bound_url'] = $home;
        update_option('feedbackpress_settings', $s, false);
        wp_safe_redirect(admin_url('options-general.php?page=feedbackpress&saved=1')); exit;
    }
    public static function sync(): void {
        self::authorize(); Sync::run();
        wp_safe_redirect(admin_url('options-general.php?page=feedbackpress&synced=1')); exit;
    }
    public static function page(): void {
        if (!current_user_can('manage_options')) return;
        $s = settings();
        ?>
        <div class="wrap" style="max-width:900px">
            <h1>FeedbackPress</h1>
            <p>Collect client feedback on the page. Keep Production, Staging, and Local in sync.</p>
            <?php if (!bound()): ?><div class="notice notice-warning"><p>This site was copied or its address changed. Confirm its environment and save settings to enable feedback and synchronization.</p></div><?php endif; ?>
            <?php if (isset($_GET['saved'])): ?><div class="notice notice-success"><p>Settings saved.</p></div><?php endif; ?>
            <p><a class="button" href="<?php echo esc_url(home_url('/?feedbackpress=open')); ?>">Open site feedback</a></p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="feedbackpress_save"><?php wp_nonce_field('feedbackpress_settings'); ?>
                <?php if (!wp_mkdir_p(Store::directory()) || !is_writable(Store::directory())): ?><div class="notice notice-error"><p>Attachment storage is not writable. Set FEEDBACKPRESS_STORAGE_DIR in wp-config.php to a writable directory outside the public web root.</p></div><?php endif; ?>
                <h2>Review access</h2>
                <table class="form-table"><tr><th><label for="fp-mode">Who can review?</label></th><td><select id="fp-mode" name="mode"><?php foreach (['everyone' => 'Everyone', 'admins' => 'Logged-in administrators', 'disabled' => 'Disabled'] as $v => $label): ?><option value="<?php echo esc_attr($v); ?>" <?php selected($s['mode'], $v); ?>><?php echo esc_html($label); ?></option><?php endforeach; ?></select><p class="description">Anyone with review access can read feedback and attachments, add comments, and change statuses. Authenticated sync remains available when the overlay is disabled.</p></td></tr>
                <tr><th><label for="fp-retention">Attachment retention</label></th><td><input id="fp-retention" type="number" min="1" max="3650" name="retention" value="<?php echo (int) $s['retention']; ?>"> days<p class="description">Applies to new uploads, measured from upload time. Expiration travels with the file to every environment. Comments remain after files expire.</p></td></tr></table>
                <h2>Environments</h2>
                <p>Local initiates two-way sync with remote sites. Each site keeps its own review access setting. After copying a site, save the correct environment here.</p>
                <table class="form-table"><tr><th><label for="fp-environment">This installation</label></th><td><select id="fp-environment" name="environment"><?php foreach (['production', 'staging', 'local'] as $env): ?><option <?php selected($s['environment'], $env); ?> value="<?php echo esc_attr($env); ?>"><?php echo esc_html(ucfirst($env)); ?></option><?php endforeach; ?></select></td></tr>
                <?php foreach (['production', 'staging', 'local'] as $env): ?><tr><th><label for="fp-<?php echo esc_attr($env); ?>"><?php echo esc_html(ucfirst($env)); ?> URL</label></th><td><input class="regular-text" id="fp-<?php echo esc_attr($env); ?>" type="url" name="<?php echo esc_attr($env); ?>" value="<?php echo esc_attr($s[$env]); ?>"></td></tr><?php endforeach; ?>
                <tr><th><label for="fp-project">Project ID</label></th><td><input class="regular-text" id="fp-project" name="project" value="<?php echo esc_attr($s['project']); ?>" required></td></tr>
                <tr><th><label for="fp-secret">Shared sync key</label></th><td><input class="regular-text" id="fp-secret" name="secret" type="password" autocomplete="off" value="<?php echo esc_attr($s['secret']); ?>" required><button type="button" class="button" onclick="const f=document.getElementById('fp-secret');f.type=f.type==='password'?'text':'password';this.textContent=f.type==='password'?'Show key':'Hide key'">Show key</button><p class="description">Use the same project ID and key on all three sites. Keep this key private: it grants API read/write and synchronization access. Replacing it here rotates access; update peers too.</p></td></tr></table>
                <?php submit_button('Save settings'); ?>
            </form>
            <hr><h2>Synchronization</h2><p>Scheduled every 30 minutes through WP-Cron. On quiet sites, configure server cron for dependable timing. Local catches up while it is running.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><input type="hidden" name="action" value="feedbackpress_sync"><?php wp_nonce_field('feedbackpress_settings'); submit_button('Sync now', 'secondary'); ?></form>
            <?php $results = get_option('feedbackpress_sync_result', []); if (!$results): ?><p>No sync results yet. Enter another environment URL to connect it.</p><?php else: ?><pre style="white-space:pre-wrap"><?php echo esc_html(wp_json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); ?></pre><?php endif; ?>
            <h2>Agent API</h2><p>Base URL: <code><?php echo esc_html(rest_url('feedbackpress/v1/')); ?></code></p><p>Authenticate using <code>X-FeedbackPress-Key</code>, or a WordPress administrator Application Password. See docs/USAGE.md for endpoints and status revision handling.</p>
        </div>
        <?php
    }
}
