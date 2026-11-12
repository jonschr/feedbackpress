<?php
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON', true);
// Pure signature/actor checks in a real WP bootstrap, intercepted HTTP, no options saved.
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\Service;
use FeedbackPress\ReviewAccess;
use FeedbackPress\API;
$cfg = ['mode' => 'admins'];
$c = ['project' => '11111111-1111-4111-8111-111111111111', 'credential_id' => '22222222-2222-4222-8222-222222222222', 'token' => 'fp_' . str_repeat('x', 43), 'site_url' => Service::home(), 'service' => 'https://service.example.test'];
add_filter('pre_option_feedbackpress_settings', function () use (&$cfg) { return $cfg; });
add_filter('pre_option_' . Service::OPTION, function () use (&$c) { return Service::pack($c); });
add_filter('pre_http_request', function () { throw new RuntimeException('Unexpected external request'); });
$assert = function ($ok) { if (!$ok) throw new RuntimeException('Review-link assertion failed'); };
// Cross-language expected signature generated independently by Node.
$token = getenv('FEEDBACKPRESS_REVIEW_UNIT_TOKEN'); if (!$token) throw new RuntimeException('Synthetic signature required');
wp_set_current_user(0); $assert(!API::can_view());
$_COOKIE[ReviewAccess::COOKIE] = $token; $assert(API::can_view()); $assert(is_wp_error(API::privateRead()));
$original = $c;
foreach (['project','credential_id','token','site_url'] as $key) { $c[$key] .= 'changed'; $assert(!ReviewAccess::grant()); $c = $original; }
$_COOKIE[ReviewAccess::COOKIE] = ['malformed']; $assert(!ReviewAccess::grant());
$_COOKIE[ReviewAccess::COOKIE] = $token; $cfg['mode'] = 'disabled'; $assert(!API::can_view());
$cfg['mode'] = 'everyone'; unset($_COOKIE[ReviewAccess::COOKIE]); $assert(API::can_view()); $assert(is_wp_error(API::privateRead()));
$cfg['mode'] = 'admins'; wp_set_current_user(1); $assert(API::can_view());
echo 'PASS Real WP cross-language signature, access modes, current connection binding, malformed cookies and guest private denial. No writes or HTTP.';
