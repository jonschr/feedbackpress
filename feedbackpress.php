<?php
/**
 * Plugin Name: FeedbackPress
 * Plugin URI: https://github.com/jonschr/feedbackpress
 * Update URI: https://github.com/jonschr/feedbackpress
 * Description: On-page client feedback, screenshots, and central project storage.
 * Version: 0.3.0-beta.1
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
namespace FeedbackPress;
defined('ABSPATH') || exit;
const VERSION = '0.3.0-beta.1';
require_once __DIR__ . '/includes/service.php';
require_once __DIR__ . '/includes/api.php';
require_once __DIR__ . '/includes/identity.php';
require_once __DIR__ . '/includes/log.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/cli.php';
require_once __DIR__ . '/includes/update-checker.php';
function defaults(): array { return ['mode' => 'everyone']; }
function settings(): array { return (array) get_option('feedbackpress_settings', []) + defaults(); }
function bound(): bool { return !empty(Service::connection()['project']); }
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
register_activation_hook(__FILE__, function () { wp_clear_scheduled_hook('feedbackpress_tick'); });
add_action('rest_api_init', [API::class, 'routes']);
add_filter('application_password_is_api_request', [API::class, 'hosting_auth']);
add_action('admin_menu', [Admin::class, 'menu']);
add_action('admin_enqueue_scripts', [Admin::class, 'assets']);
add_action('wp_enqueue_scripts', function () {
    if (!API::can_view() || !bound() || is_feed()) return;
    $assetVersion = VERSION . '.' . max(filemtime(__DIR__ . '/assets/review.js'), filemtime(__DIR__ . '/assets/review.css'));
    wp_enqueue_script('feedbackpress-capture', plugins_url('assets/vendor/html2canvas-pro.min.js', __FILE__), [], '2.6.3', true);
    wp_enqueue_script('feedbackpress', plugins_url('assets/review.js', __FILE__), ['feedbackpress-capture'], $assetVersion, true);
    wp_localize_script('feedbackpress', 'FeedbackPressConfig', ['api' => esc_url_raw(rest_url('feedbackpress/v1/')), 'nonce' => wp_create_nonce('wp_rest'), 'home' => untrailingslashit(home_url()), 'environment' => 'central', 'maxBytes' => API::MAX_FILE, 'css' => plugins_url('assets/review.css', __FILE__) . '?ver=' . $assetVersion, 'activitySync' => true, 'network' => Service::connection()['project'], 'cursor' => '0', 'privateNotes' => is_user_logged_in(), 'authorId' => is_user_logged_in() ? Identity::id(wp_get_current_user()->user_email) : '', 'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '']);
});
