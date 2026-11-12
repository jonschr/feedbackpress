<?php
// Real WordPress options/identity; isolated fixture only, no central requests or feedback writes.
if (home_url() !== 'https://feedbackpress-access-qa.localhost:8453') throw new RuntimeException('Isolated review-access fixture only.');
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\ReviewAccess as Access;
use FeedbackPress\API;
use FeedbackPress\Service;
$original = get_option(Access::OPTION, null);
$cfg = ['mode' => 'admins', 'link_sharing' => 'admins'];
$connection = ['project' => wp_generate_uuid4(), 'token' => 'fixture', 'credential_id' => wp_generate_uuid4(), 'service' => 'https://service.example.test', 'site_url' => home_url()];
add_filter('pre_option_feedbackpress_settings', function () use (&$cfg) { return $cfg; });
add_filter('pre_option_' . Service::OPTION, function () use (&$connection) { return Service::pack($connection); });
add_filter('pre_http_request', function () { throw new RuntimeException('Unexpected fixture HTTP request.', 599); });
$ok = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$request = function ($body = []) { $r = new WP_REST_Request('POST'); $r->set_body_params($body); return $r; };
$denied = function (callable $work, int $code) use ($ok) { try { $work(); } catch (Throwable $e) { $ok($e->getCode() === $code, 'Unexpected rejection code'); return; } throw new RuntimeException('Expected rejection'); };
try {
    update_option(Access::OPTION, [], false); wp_set_current_user(1);
    $link = Access::create($request(['label' => 'Client review', 'days' => 7, 'path' => '/?page_id=2&view=a%20b#feedbackpress=issue']));
    parse_str(wp_parse_url($link['url'], PHP_URL_FRAGMENT), $fragment); $token = $fragment['fp-review'];
    $ok(str_contains($link['url'], '/?page_id=2&view=a%20b#'), 'Query was changed');
    $ok($fragment['fp-return'] === 'feedbackpress=issue', 'Original fragment was lost');
    $ok(!str_contains(wp_json_encode(get_option(Access::OPTION)), explode('.', $token)[1]), 'Raw secret was persisted');
    $ok(!str_contains(wp_json_encode(Access::listing()), 'hash'), 'Management response leaked a hash');
    $denied(fn() => Access::create($request(['days' => 0])), 0);
    foreach (['//outside.example/', '/../outside', '/%2e%2e/outside', '/\\outside'] as $path) $denied(fn() => Access::create($request(['path' => $path])), 0);
    wp_set_current_user(0); $ok(!API::can_view(), 'Ordinary guest was admitted');
    $_COOKIE[Access::COOKIE] = $token; $ok(API::can_view(), 'Review link did not admit the guest');
    $ok(is_wp_error(API::privateRead()), 'Link admitted a guest to private notes');
    $denied(fn() => Access::create($request()), 403);
    $cfg['link_sharing'] = 'everyone'; $ok(Access::can_share(), 'Explicit reviewer sharing policy was ignored'); Access::create($request(['label' => 'Delegated review']));
    $r = new WP_REST_Request('GET'); $r->set_header('Origin', 'https://other.example.test'); $ok(is_wp_error(API::read($r)), 'Cross-origin cookie read was admitted');
    $foreign = $connection; $foreign['project'] = wp_generate_uuid4(); $foreign['credential_id'] = wp_generate_uuid4();
    $denied(fn() => Service::request('GET', '/issues', null, '', false, $foreign), 403);
    $cfg['mode'] = 'disabled'; $ok(!API::can_view() && !Access::grant($token), 'Disabled mode admitted link access');
    $cfg['mode'] = 'admins'; $cfg['link_sharing'] = 'admins';
    $saved = $connection; $connection['project'] = wp_generate_uuid4(); $ok(!API::can_view(), 'Cross-project link was accepted');
    $connection = $saved; $connection['credential_id'] = wp_generate_uuid4(); $ok(!API::can_view(), 'Rotated connection kept the old link'); $connection = $saved;
    $otherHome = fn() => 'https://other.example.test'; add_filter('home_url', $otherHome); $ok(!API::can_view(), 'Copied-site link was accepted'); remove_filter('home_url', $otherHome);
    $links = get_option(Access::OPTION); $links[$link['id']]['expires_at'] = time() - 1; update_option(Access::OPTION, $links, false); $ok(!API::can_view(), 'Expired link was accepted');
    $links[$link['id']]['expires_at'] = time() + 100; update_option(Access::OPTION, $links, false); $ok(API::can_view(), 'Valid grant was not resolved afresh');
    Access::revoke($link['id']); $ok(!API::can_view(), 'Revocation left the guest authorized');
    wp_set_current_user(1); $blockSave = fn($new, $old) => $old; add_filter('pre_update_option_' . Access::OPTION, $blockSave, 10, 2); $denied(fn() => Access::create($request()), 503); remove_filter('pre_update_option_' . Access::OPTION, $blockSave);
    $cfg['mode'] = 'everyone'; wp_set_current_user(0); $ok(API::can_view() && !Access::can_share(), 'Public review mode changed admin-only sharing');
    $ok(is_wp_error(API::privateRead()), 'Public review mode admitted private guest data');
    echo "PASS Real WordPress review-link hashing, guest/admin/everyone policies, private denial, query/fragment retention, invalid paths/durations, per-request expiry/revocation, site/project/credential isolation, foreign-origin denial and failed-save handling. No central/email/feedback requests.\n";
} finally {
    if ($original === null) delete_option(Access::OPTION); else update_option(Access::OPTION, $original, false);
    unset($_COOKIE[Access::COOKIE]);
}
