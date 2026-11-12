<?php
// Run with wp eval-file; renders a private, password-redacted fixture without saving settings.
require_once dirname(__DIR__) . '/feedbackpress.php';
$admins = get_users(['role' => 'administrator', 'number' => 1]);
if (!$admins) throw new RuntimeException('No administrator available for a read-only rendering.');
wp_set_current_user($admins[0]->ID);
ob_start(); FeedbackPress\Admin::page(); $html = ob_get_clean();
$html = preg_replace('/(<input\b(?=[^>]*type="password")[^>]*value=")[^"]*/', '$1fixture-secret', $html);
$html = preg_replace('/action="[^"]*\/wp-admin\/admin-post.php"/', 'action="https://feedbackpress.test/admin-post"', $html);
$styles = '';
foreach (['wp-includes/css/buttons.min.css', 'wp-admin/css/common.min.css', 'wp-admin/css/forms.min.css'] as $file) $styles .= file_get_contents(ABSPATH . $file);
$html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' . $styles . file_get_contents(dirname(__DIR__) . '/assets/admin.css') . '</style><body class="wp-admin wp-core-ui auto-fold"><div id="wpcontent"><div id="wpbody"><div id="wpbody-content">' . $html . '</div></div></div><script>window.FeedbackPressAdmin={api:"https://feedbackpress.test/adminapi/",nonce:"fixture"};</script><script src="https://feedbackpress.test/admin.js"></script>';
$path = '/tmp/feedbackpress-copy-admin.html';
file_put_contents($path, $html); chmod($path, 0600);
echo "Rendered current WordPress settings privately for intercepted browser checks; no settings saved.\n";
