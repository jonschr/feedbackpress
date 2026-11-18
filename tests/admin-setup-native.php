<?php
// WP-CLI --skip-plugins=feedbackpress --user=<admin> eval-file; no saved state or HTTP.
defined('ABSPATH') || exit;
require_once dirname(__DIR__) . '/feedbackpress.php';
add_filter('pre_http_request', fn() => new WP_Error('fixture_http_blocked', 'Test HTTP blocked'));
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator');
if (!has_action('activate_' . plugin_basename(dirname(__DIR__) . '/feedbackpress.php'), [FeedbackPress\Admin::class, 'activate'])
    || !has_action('admin_init', [FeedbackPress\Admin::class, 'activationRedirect'])
    || !has_action('admin_notices', [FeedbackPress\Admin::class, 'setupNotice'])) throw new RuntimeException('Missing setup hooks');
$connection = [];
add_filter('pre_option_' . FeedbackPress\Service::OPTION, function () use (&$connection) { return FeedbackPress\Service::pack($connection); });
$_GET['page'] = 'feedbackpress';
ob_start(); FeedbackPress\Admin::setupNotice(); $settings = ob_get_clean();
unset($_GET['page']); ob_start(); FeedbackPress\Admin::setupNotice(); $plugins = ob_get_clean();
$connection = ['manager' => 'synthetic']; ob_start(); FeedbackPress\Admin::setupNotice(); $connected = ob_get_clean();
if (!str_contains($settings, 'License FeedbackPress to get started.') || str_contains($settings, '<a')
    || !str_contains($plugins, 'Set up FeedbackPress') || $connected !== '') throw new RuntimeException('Incorrect setup notice');
wp_set_current_user(0); $connection = []; ob_start(); FeedbackPress\Admin::setupNotice(); $guest = ob_get_clean();
if ($guest !== '') throw new RuntimeException('Guest received administration notice');
$styles = '';
foreach (['wp-includes/css/buttons.min.css', 'wp-admin/css/common.min.css', 'wp-admin/css/forms.min.css'] as $file) $styles .= file_get_contents(ABSPATH . $file);
$html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' . $styles . '</style><body class="wp-admin wp-core-ui"><main style="padding:20px"><h1>Plugins</h1>' . $plugins . '<h1>FeedbackPress settings</h1>' . $settings . '</main></body>';
file_put_contents('/tmp/feedbackpress-setup-notice.html', $html); chmod('/tmp/feedbackpress-setup-notice.html', 0600);
echo "PASS native activation/admin hooks and connected/unconfigured/guest notices; rendered WordPress styles without saving settings or contacting the service.\n";
