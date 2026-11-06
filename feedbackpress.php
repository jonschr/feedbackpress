<?php
/**
 * Plugin Name: FeedbackPress
 * Plugin URI: https://github.com/jonschr/feedbackpress
 * Update URI: https://github.com/jonschr/feedbackpress
 * Description: On-page client feedback, screenshots, and environment synchronization.
 * Version: 0.2.1
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
namespace FeedbackPress;
defined('ABSPATH') || exit;
const VERSION = '0.2.1';
require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/network.php';
require_once __DIR__ . '/includes/api.php';
require_once __DIR__ . '/includes/log.php';
require_once __DIR__ . '/includes/sync.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/update-checker.php';
function defaults(): array { return ['mode' => 'everyone', 'secret' => bin2hex(random_bytes(32)), 'retention' => 90]; }
function settings(): array {
    $s = get_option('feedbackpress_settings', []) + defaults();
    $self = Network::self();
    return array_merge($s, ['project' => Network::data()['id'] ?? '', 'environment' => $self['type'] ?? 'local']);
}
function bound(): bool { return Network::self() !== null; }
function install(): void {
    if (!get_option('feedbackpress_settings')) add_option('feedbackpress_settings', defaults(), '', false);
    Network::upgrade(); Store::install();
    global $wpdb;
    $wpdb->query($wpdb->prepare('UPDATE ' . Store::table() . " SET network_id=%s WHERE network_id=''", Network::data()['id']));
    update_option('feedbackpress_schema_version', '2', false);
}
register_activation_hook(__FILE__, __NAMESPACE__ . '\\install');
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
add_action('init', function () { if (get_option('feedbackpress_schema_version') !== '2') install(); else Network::upgrade(); }, 1);
add_action('rest_api_init', [API::class, 'routes']);
add_filter('application_password_is_api_request', [API::class, 'hosting_auth']);
add_action('admin_menu', [Admin::class, 'menu']);
add_action('admin_post_feedbackpress_save', [Admin::class, 'save']);
add_action('admin_post_feedbackpress_network', [Admin::class, 'network']);
add_action('admin_enqueue_scripts', [Admin::class, 'assets']);
add_action('wp_enqueue_scripts', function () {
    if (!API::can_view() || !bound() || is_feed()) return;
    wp_enqueue_script('feedbackpress-capture', plugins_url('assets/vendor/html2canvas-pro.min.js', __FILE__), [], '2.6.3', true);
    wp_enqueue_script('feedbackpress', plugins_url('assets/review.js', __FILE__), ['feedbackpress-capture'], VERSION, true);
    wp_localize_script('feedbackpress', 'FeedbackPressConfig', ['api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => wp_create_nonce('wp_rest'), 'home' => untrailingslashit(home_url()), 'environment' => settings()['environment'], 'maxBytes' => API::MAX_FILE, 'css' => plugins_url('assets/review.css', __FILE__) . '?ver=' . VERSION, 'activitySync' => true, 'network' => settings()['project'], 'cursor' => Store::cursor(), 'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '']);
});

if (defined('WP_CLI') && WP_CLI) {
    \WP_CLI::add_command('feedbackpress sync-log', function () { \WP_CLI::line(wp_json_encode(Log::entries(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); });
    \WP_CLI::add_command('feedbackpress sync', function () { \WP_CLI::line(wp_json_encode(Sync::run(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); });
}
