<?php
/**
 * Plugin Name: FeedbackPress
 * Plugin URI: https://github.com/jonschr/feedbackpress
 * Update URI: https://github.com/jonschr/feedbackpress
 * Description: On-page client feedback, screenshots, and central project storage.
 * Version: 0.3.0-beta.4
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
namespace FeedbackPress;
defined('ABSPATH') || exit;
const VERSION = '0.3.0-beta.4';
require_once __DIR__ . '/includes/service.php';
require_once __DIR__ . '/includes/review-access.php';
require_once __DIR__ . '/includes/api.php';
require_once __DIR__ . '/includes/identity.php';
require_once __DIR__ . '/includes/log.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/cli.php';
require_once __DIR__ . '/includes/update-checker.php';
function defaults(): array { return ['mode' => 'everyone']; }
function settings(): array { return (array) get_option('feedbackpress_settings', []) + defaults(); }
function bound(): bool { $c = Service::connection(); return !empty($c['project']) && !empty($c['token']) && empty($c['disconnected']); }
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
register_activation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
add_action('rest_api_init', [API::class, 'routes']);
add_filter('application_password_is_api_request', [API::class, 'hosting_auth']);
add_action('admin_menu', [Admin::class, 'menu']);
add_action('admin_enqueue_scripts', [Admin::class, 'assets']);
add_action('template_redirect', function () { if (is_user_logged_in() || ReviewAccess::grant()) { if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE', true); nocache_headers(); } });
function asset_version(): string { return VERSION . '.' . max(filemtime(__DIR__ . '/assets/review.js'), filemtime(__DIR__ . '/assets/review.css')); }
function frontend_config(): array {
    return ['api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => wp_create_nonce('wp_rest'), 'home' => untrailingslashit(home_url()), 'environment' => 'central', 'maxBytes' => API::MAX_FILE, 'css' => plugins_url('assets/review.css', __FILE__) . '?ver=' . asset_version(), 'activitySync' => true, 'network' => Service::connection()['project'], 'cursor' => '0', 'privateNotes' => is_user_logged_in(), 'authorId' => is_user_logged_in() ? Identity::id(wp_get_current_user()->user_email) : '', 'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '', 'reviewSession' => (bool) ReviewAccess::grant()];
}
add_action('wp_enqueue_scripts', function () {
    if (is_feed()) return;
    wp_enqueue_script('feedbackpress-access', plugins_url('assets/review-access.js', __FILE__), [], VERSION . '.' . filemtime(__DIR__ . '/assets/review-access.js'), false);
    wp_localize_script('feedbackpress-access', 'FeedbackPressAccess', ['api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => settings()['mode'] !== 'everyone' && is_user_logged_in() ? wp_create_nonce('wp_rest') : '']);
    // Gated visitors bootstrap through an uncached permission check, even when the page HTML was cached.
    if (settings()['mode'] !== 'everyone' || !API::can_view() || !bound()) return;
    $assetVersion = asset_version();
    $stylesheet = plugins_url('assets/review.css', __FILE__) . '?ver=' . $assetVersion;
    add_action('wp_head', static function () use ($stylesheet) {
        echo '<link rel="preload" href="' . esc_url($stylesheet) . '" as="style">' . "\n";
    });
    wp_enqueue_script('feedbackpress-capture', plugins_url('assets/vendor/html2canvas-pro.min.js', __FILE__), [], '2.6.3', true);
    wp_enqueue_script('feedbackpress', plugins_url('assets/review.js', __FILE__), ['feedbackpress-capture'], $assetVersion, true);
    wp_localize_script('feedbackpress', 'FeedbackPressConfig', frontend_config());
});
