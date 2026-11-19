<?php
/**
 * Plugin Name: FeedbackPress
 * Plugin URI: https://github.com/jonschr/feedbackpress
 * Update URI: https://github.com/jonschr/feedbackpress
 * Description: On-page client feedback, screenshots, and central project storage.
 * Version: 0.4.0
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
namespace FeedbackPress;
defined('ABSPATH') || exit;
const VERSION = '0.4.0';
require_once __DIR__ . '/includes/service.php';
require_once __DIR__ . '/includes/review-access.php';
require_once __DIR__ . '/includes/api.php';
require_once __DIR__ . '/includes/identity.php';
require_once __DIR__ . '/includes/class-email-verification.php';
require_once __DIR__ . '/includes/log.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/agent.php';
require_once __DIR__ . '/includes/cli.php';
require_once __DIR__ . '/includes/update-checker.php';
function defaults(): array { return ['mode' => 'admins']; }
function settings(): array { return (array) get_option('feedbackpress_settings', []) + defaults(); }
function bound(): bool { $c = Service::connection(); return !empty($c['project']) && !empty($c['token']) && empty($c['disconnected']); }
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
register_activation_hook(__FILE__, [Admin::class, 'activate']);
add_action('admin_init', [Admin::class, 'activationRedirect']);
add_action('admin_notices', [Admin::class, 'setupNotice']);
add_action('rest_api_init', [API::class, 'routes']);
add_action('wp_abilities_api_categories_init', [Agent::class, 'category']);
add_action('wp_abilities_api_init', [Agent::class, 'abilities']);
add_filter('application_password_is_api_request', [API::class, 'hosting_auth']);
add_action('admin_menu', [Admin::class, 'menu']);
add_filter('plugin_action_links_' . plugin_basename(__FILE__), [Admin::class, 'pluginLinks']);
add_action('admin_enqueue_scripts', [Admin::class, 'assets']);
add_action('template_redirect', function () { if (is_user_logged_in() || ReviewAccess::grant()) { if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE', true); nocache_headers(); } });
function asset_version(): string { return VERSION . '.' . max(filemtime(__DIR__ . '/assets/review.js'), filemtime(__DIR__ . '/assets/review.css')); }
function frontend_config(): array {
    return ['verifiedReviewer' => Email_Verification::current(), 'loginUrl' => wp_login_url(), 'canShareReviewLinks' => current_user_can('manage_options'), 'reviewAccess' => true, 'api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => wp_create_nonce('wp_rest'), 'home' => untrailingslashit(home_url()), 'maxBytes' => API::MAX_FILE, 'css' => plugins_url('assets/review.css', __FILE__) . '?ver=' . asset_version(), 'activitySync' => true, 'network' => Service::connection()['project'], 'cursor' => '0', 'privateNotes' => is_user_logged_in(), 'authorId' => is_user_logged_in() ? Identity::id(wp_get_current_user()->user_email) : '', 'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '', 'reviewSession' => (bool) ReviewAccess::grant()];
}
add_action('wp_enqueue_scripts', function () {
    if (is_feed()) return;
    wp_enqueue_script('feedbackpress-access', plugins_url('assets/review-access.js', __FILE__), [], VERSION . '.' . filemtime(__DIR__ . '/assets/review-access.js'), false);
    // Resolve all identity and permission state through an uncached request, including public review mode.
    wp_localize_script('feedbackpress-access', 'FeedbackPressAccess', ['api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '', 'publicReview' => settings()['mode'] === 'everyone' && bound()]);
});
