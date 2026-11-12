<?php
// Current source, real WordPress actor/options, ephemeral service; never save site connections/settings.
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON', true);
if (!in_array(home_url(), ['https://feedbackpress-access-qa.localhost:8453', 'https://feedbackpress-access-other.localhost:8453'], true)) throw new RuntimeException('Isolated fixtures only.');
$file = getenv('FEEDBACKPRESS_REVIEW_FIXTURE'); if (!$file) throw new RuntimeException('Disposable fixture required.');
define('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE', true);
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\ReviewAccess as Access;
use FeedbackPress\API;
use FeedbackPress\Service;
$sites = json_decode(file_get_contents($file), true); $host = wp_parse_url(home_url(), PHP_URL_HOST); $site = substr($host, 0, -10);
$entry = $sites[$site]; $connection = ['project' => $entry['project'], 'token' => $entry['token'], 'credential_id' => $entry['credential_id'], 'site_url' => $entry['url'], 'service' => 'http://127.0.0.1:8791'];
$cfg = ['mode' => 'admins'];
add_filter('pre_option_feedbackpress_settings', function () use (&$cfg) { return $cfg; });
add_filter('pre_option_' . Service::OPTION, function () use (&$connection) { return Service::pack($connection); });
add_filter('pre_http_request', function ($pre, $args, $url) { if (!str_starts_with($url, 'http://127.0.0.1:8791/v1/')) throw new RuntimeException('External fixture request forbidden.'); return $pre; }, 10, 3);
$ok = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
wp_set_current_user(1); $a = Access::link(); $b = Access::link(); $ok($a === $b, 'Repeated copy changed URL');
$ok(str_starts_with($a['url'], home_url() . '/#fp-review='), 'Wrong destination');
parse_str(wp_parse_url($a['url'], PHP_URL_FRAGMENT), $fragment); $token = $fragment['fp-review'];
wp_set_current_user(0); $ok(!API::can_view(), 'Uninvited guest admitted');
try { Access::link(); throw new RuntimeException('Guest copied link'); } catch (Throwable $e) { $ok($e->getCode() === 403, 'Guest link endpoint not denied'); }
$_COOKIE[Access::COOKIE] = $token; $ok(API::can_view(), 'Client link denied');
$ok(is_wp_error(API::privateRead()), 'Private notes admitted guest');
Service::request('GET', '/issues');
$saved = $connection;
$connection['project'] = wp_generate_uuid4(); $ok(!Access::grant(), 'Other project admitted');
$connection = $saved; $connection['credential_id'] = wp_generate_uuid4(); $ok(!Access::grant(), 'Other credential admitted');
$connection = $saved; $connection['site_url'] = 'https://other.example.test'; $ok(!Access::grant(), 'Other site admitted');
$connection = $saved; $_COOKIE[Access::COOKIE] = ['bad']; $ok(!Access::grant(), 'Malformed cookie admitted');
$_COOKIE[Access::COOKIE] = $token; $cfg['mode'] = 'disabled'; $ok(!API::can_view(), 'Disabled access admitted');
$cfg['mode'] = 'everyone'; unset($_COOKIE[Access::COOKIE]); $ok(API::can_view(), 'Public access denied'); $ok(is_wp_error(API::privateRead()), 'Public guest private access');
echo 'PASS Reusable central review link, no individual invitation records, guest/private denial and current site/project/credential binding.';
