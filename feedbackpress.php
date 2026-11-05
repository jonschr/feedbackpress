<?php
/**
 * Plugin Name: FeedbackPress
 * Plugin URI: https://github.com/jonschr/feedbackpress
 * Update URI: https://github.com/jonschr/feedbackpress
 * Description: On-page client feedback, screenshots, and environment synchronization.
 * Version: 0.1.22
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
namespace FeedbackPress;
defined('ABSPATH') || exit;
const VERSION = '0.1.22';
require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/api.php';
require_once __DIR__ . '/includes/sync.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/update-checker.php';
function defaults(): array {
    return ['mode' => 'everyone', 'environment' => 'local', 'bound_url' => untrailingslashit(home_url()), 'project' => wp_generate_uuid4(), 'secret' => bin2hex(random_bytes(32)), 'production' => '', 'staging' => '', 'local' => untrailingslashit(home_url()), 'retention' => 90];
}
function settings(): array { return get_option('feedbackpress_settings', []); }
function bound(): bool { return (settings()['bound_url'] ?? '') === untrailingslashit(home_url()); }
function install(): void {
    Store::install();
    if (!get_option('feedbackpress_settings')) add_option('feedbackpress_settings', defaults(), '', false);
    if (!wp_next_scheduled('feedbackpress_tick')) wp_schedule_event(time() + 1800, 'feedbackpress_half_hour', 'feedbackpress_tick');
}
add_filter('cron_schedules', function ($s) { $s['feedbackpress_half_hour'] = ['interval' => 1800, 'display' => 'Every 30 minutes']; return $s; });
register_activation_hook(__FILE__, __NAMESPACE__ . '\\install');
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
add_action('feedbackpress_tick', function () { Sync::run(); Store::cleanup(); });
add_action('init', [Store::class, 'migrate_numbers']);
add_action('rest_api_init', [API::class, 'routes']);
add_action('admin_menu', [Admin::class, 'menu']);
add_action('admin_post_feedbackpress_save', [Admin::class, 'save']);
add_action('admin_post_feedbackpress_sync', [Admin::class, 'sync']);
add_action('wp_enqueue_scripts', function () {
    if (!API::can_view() || !bound() || is_feed()) return;
    wp_enqueue_script('feedbackpress-capture', plugins_url('assets/vendor/html2canvas-pro.min.js', __FILE__), [], '2.6.3', true);
    wp_enqueue_script('feedbackpress', plugins_url('assets/review.js', __FILE__), ['feedbackpress-capture'], VERSION, true);
    wp_localize_script('feedbackpress', 'FeedbackPressConfig', ['api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => wp_create_nonce('wp_rest'), 'home' => untrailingslashit(home_url()), 'environment' => settings()['environment'], 'maxBytes' => API::MAX_FILE, 'css' => plugins_url('assets/review.css', __FILE__) . '?ver=' . VERSION, 'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '']);
});
