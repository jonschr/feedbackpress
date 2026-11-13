<?php
// Run with wp --skip-plugins=feedbackpress --user=admin eval-file; renders private fixtures without saving settings.
require_once dirname(__DIR__) . '/feedbackpress.php';
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator with --user for read-only rendering.');
ob_start(); FeedbackPress\Admin::page(); $html = ob_get_clean();
$html = preg_replace('/action="[^"]*\/wp-admin\/admin-post.php"/', 'action="https://feedbackpress.test/admin-post"', $html);
$styles = '';
foreach (['wp-includes/css/buttons.min.css', 'wp-admin/css/common.min.css', 'wp-admin/css/forms.min.css'] as $file) $styles .= file_get_contents(ABSPATH . $file);
$html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' . $styles . file_get_contents(dirname(__DIR__) . '/assets/admin.css') . '</style><body class="wp-admin wp-core-ui auto-fold"><div id="wpcontent"><div id="wpbody"><div id="wpbody-content">' . $html . '</div></div></div><script>window.FeedbackPressAdmin={api:"https://feedbackpress.test/adminapi/",nonce:"fixture"};</script><script src="https://feedbackpress.test/admin.js"></script>';
$path = '/tmp/feedbackpress-copy-admin.html';
file_put_contents($path, $html); chmod($path, 0600);
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => '', 999);
add_filter('pre_option_feedbackpress_settings', fn() => [], 999);
ob_start(); FeedbackPress\Admin::page(); $disconnected = ob_get_clean();
$disconnected = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' . $styles . file_get_contents(dirname(__DIR__) . '/assets/admin.css') . '</style><body class="wp-admin wp-core-ui"><div id="wpcontent"><div id="wpbody-content">' . $disconnected . '</div></div><script>window.FeedbackPressAdmin={api:"https://feedbackpress.test/adminapi/",nonce:"fixture"};</script><script src="https://feedbackpress.test/admin.js"></script>';
$path = '/tmp/feedbackpress-disconnected-admin.html'; file_put_contents($path, $disconnected); chmod($path, 0600);
echo "Rendered connected/first-use WordPress settings privately for intercepted browser checks; no settings saved.\n";

// A synthetic free-account connection exercises secret-copy controls without exposing a real key.
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack(['v'=>3,'service'=>'https://feedbackpress.test','manager'=>'fixture','access_key'=>'fp_fixture_key_never_emit']), 1000);
ob_start(); FeedbackPress\Admin::page(); $free = ob_get_clean();
$free = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' . $styles . file_get_contents(dirname(__DIR__) . '/assets/admin.css') . '</style><body class="wp-admin wp-core-ui"><div id="wpcontent"><div id="wpbody-content">' . $free . '</div></div><script>window.FeedbackPressAdmin={api:"https://feedbackpress.test/adminapi/",nonce:"fixture"};</script><script src="https://feedbackpress.test/admin.js"></script>';
if (str_contains($free, 'fp_fixture_key_never_emit')) throw new RuntimeException('An account key leaked into rendered markup');
file_put_contents('/tmp/feedbackpress-free-admin.html', $free); chmod('/tmp/feedbackpress-free-admin.html', 0600);
