<?php
// Standalone lifecycle fixture: no WordPress database, redirects or external HTTP.
namespace FeedbackPress;
define('ABSPATH', __DIR__ . '/');
define('MINUTE_IN_SECONDS', 60);
if (($argv[1] ?? '') === 'cli') define('WP_CLI', true);
final class Service { public static function connection(): array { return $GLOBALS['fixture']['connection']; } }
final class Redirected extends \RuntimeException {}
function wp_clear_scheduled_hook($hook) { $GLOBALS['fixture']['cleared'][] = $hook; }
function is_network_admin() { return $GLOBALS['fixture']['network']; }
function wp_doing_ajax() { return $GLOBALS['fixture']['ajax']; }
function current_user_can($capability) { return $GLOBALS['fixture']['admin']; }
function get_current_user_id() { return $GLOBALS['fixture']['user']; }
function set_transient($key, $value, $ttl) { $GLOBALS['fixture']['transients'][$key] = $value; }
function get_transient($key) { return $GLOBALS['fixture']['transients'][$key] ?? false; }
function delete_transient($key) { unset($GLOBALS['fixture']['transients'][$key]); }
function admin_url($path) { return 'https://site.example/wp-admin/' . $path; }
function esc_url($value) { return htmlspecialchars($value, ENT_QUOTES); }
function headers_sent() { return $GLOBALS['fixture']['headers']; }
function wp_safe_redirect($url) { $GLOBALS['fixture']['redirects'][] = $url; throw new Redirected(); }
require dirname(__DIR__) . '/includes/admin.php';
function fresh(): void {
    $GLOBALS['fixture'] = ['admin' => true, 'user' => 7, 'network' => false, 'ajax' => false, 'headers' => false, 'connection' => [], 'transients' => [], 'redirects' => [], 'cleared' => []];
    $_REQUEST = $_GET = $_POST = [];
}
function check($value): void { if (!$value) throw new \RuntimeException('Activation assertion failed'); }
function redirect(): void { try { Admin::activationRedirect(); } catch (Redirected $expected) {} }
fresh();
if (defined('WP_CLI')) {
    Admin::activate(); redirect(); check(!$GLOBALS['fixture']['transients'] && !$GLOBALS['fixture']['redirects']);
    echo "PASS CLI activation skips redirects.\n"; exit;
}
Admin::activate(); check($GLOBALS['fixture']['cleared'] === ['feedbackpress_tick']);
$GLOBALS['fixture']['user'] = 8; redirect(); check(!$GLOBALS['fixture']['redirects']);
$GLOBALS['fixture']['user'] = 7; redirect();
check($GLOBALS['fixture']['redirects'] === [admin_url('options-general.php?page=feedbackpress')]);
redirect(); check(count($GLOBALS['fixture']['redirects']) === 1 && !$GLOBALS['fixture']['transients']);
foreach (['network', 'ajax', 'admin', 'manager', 'bulk', 'bulk-bottom', 'bulk-return', 'network-wide'] as $case) {
    fresh();
    if (in_array($case, ['network', 'ajax'], true)) $GLOBALS['fixture'][$case] = true;
    elseif ($case === 'admin') $GLOBALS['fixture']['admin'] = false;
    elseif ($case === 'manager') $GLOBALS['fixture']['connection'] = ['manager' => 'synthetic'];
    elseif ($case === 'bulk') $_REQUEST['action'] = 'activate-selected';
    elseif ($case === 'bulk-bottom') $_REQUEST['action2'] = 'activate-selected';
    elseif ($case === 'bulk-return') $_REQUEST['activate-multi'] = true;
    Admin::activate($case === 'network-wide'); check(!$GLOBALS['fixture']['transients']);
}
fresh(); Admin::activate(); $_GET['page'] = 'feedbackpress'; redirect(); check(!$GLOBALS['fixture']['redirects'] && !$GLOBALS['fixture']['transients']);
fresh(); Admin::activate(); $GLOBALS['fixture']['connection'] = ['manager' => 'synthetic']; redirect(); check(!$GLOBALS['fixture']['redirects']);
fresh(); Admin::activate(); $GLOBALS['fixture']['headers'] = true; redirect(); check(!$GLOBALS['fixture']['redirects']);
fresh(); Admin::activate(); $_POST['save'] = 'settings'; redirect(); check(!$GLOBALS['fixture']['redirects']);
fresh(); Admin::activate(); $_REQUEST['action'] = 'activate-selected'; redirect(); check(!$GLOBALS['fixture']['redirects']);
fresh(); ob_start(); Admin::setupNotice(); $notice = ob_get_clean();
check(str_contains($notice, 'License FeedbackPress to get started.') && str_contains($notice, 'Set up FeedbackPress') && str_contains($notice, admin_url('options-general.php?page=feedbackpress')));
$_GET['page'] = 'feedbackpress'; ob_start(); Admin::setupNotice(); $notice = ob_get_clean(); check(str_contains($notice, 'License FeedbackPress') && !str_contains($notice, '<a'));
foreach (['manager', 'nonadmin', 'network'] as $case) {
    fresh(); if ($case === 'manager') $GLOBALS['fixture']['connection'] = ['manager' => 'synthetic']; elseif ($case === 'nonadmin') $GLOBALS['fixture']['admin'] = false; else $GLOBALS['fixture']['network'] = true;
    ob_start(); Admin::setupNotice(); check(ob_get_clean() === '');
}
echo "PASS activation redirects once for the activating administrator, preserves connected sites, skips bulk/network/AJAX, avoids loops and shows scoped setup notices.\n";
