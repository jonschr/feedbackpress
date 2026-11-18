<?php
// Native WordPress with intercepted service reads; no stored configuration or feedback changes.
defined('ABSPATH') || exit;
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator');
$admin = wp_get_current_user(); $owner = true; $mode = 'admins'; $calls = [];
$project = '11111111-1111-4111-8111-111111111111';
$c = ['service' => 'https://service.example.test', 'project' => $project, 'credential_id' => '22222222-2222-4222-8222-222222222222', 'token' => 'fp_fixture', 'site_url' => FeedbackPress\Service::home()];
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack($c));
add_filter('pre_option_feedbackpress_settings', function () use (&$mode) { return ['mode' => $mode]; });
add_filter('pre_http_request', function ($pre, $args, $url) use (&$owner, &$calls, $admin, $project) {
    $calls[] = $url;
    $actor = FeedbackPress\Service::unpack($args['headers']['X-FeedbackPress-Actor'] ?? '');
    if ($args['method'] !== 'GET' || $actor['email'] !== strtolower($admin->user_email) || $args['headers']['Authorization'] !== 'Bearer fp_fixture') throw new RuntimeException('Wrong environment identity or credential');
    if ($url === 'https://service.example.test/v1/projects/' . $project . '/review-access') $data = ['paused' => false, 'can_create' => true, 'account_owner' => $owner];
    elseif ($url === 'https://service.example.test/v1/projects/' . $project . '/environment-links') $data = ['sites' => [['url' => 'https://live.example.test', 'review_url' => 'https://live.example.test/#fp-review=synthetic']]];
    else throw new RuntimeException('Unexpected environment lookup');
    return ['headers' => [], 'response' => ['code' => 200], 'body' => wp_json_encode($data)];
}, 10, 3);
$check = function ($condition) { if (!$condition) throw new RuntimeException('Environment permission assertion failed'); };
$request = new WP_REST_Request('GET', '/feedbackpress/v1/admin/environments');
$result = rest_do_request($request); $check($result->get_status() === 200);
$check($result->get_data() === ['sites' => [['url' => 'https://live.example.test', 'review_url' => 'https://live.example.test/#fp-review=synthetic']]]);
$owner = false; $before = count($calls); $check(rest_do_request($request)->get_status() === 403 && count($calls) === $before + 1);
$owner = true; $before = count($calls); $request->set_header('X-FeedbackPress-Network', '33333333-3333-4333-8333-333333333333');
$check(rest_do_request($request)->get_status() === 409 && count($calls) === $before); $request->set_header('X-FeedbackPress-Network', '');
$mode = 'disabled'; $check(rest_do_request($request)->get_status() === 403 && count($calls) === $before); $mode = 'everyone';
$reader = new WP_User(); $reader->ID = PHP_INT_MAX; $reader->data = (object) ['display_name' => 'Reader', 'user_email' => $admin->user_email]; $reader->allcaps = ['read' => true]; $GLOBALS['current_user'] = $reader;
$check(rest_do_request($request)->get_status() === 403 && count($calls) === $before);
wp_set_current_user(0); $check(rest_do_request($request)->get_status() === 403 && count($calls) === $before);
$GLOBALS['current_user'] = $admin;
echo "PASS owner-and-administrator environment permissions, server-resolved actor, site-scoped project, URL-only payload, nonowner/read-only/guest/disabled denial. No real HTTP or writes.\n";
