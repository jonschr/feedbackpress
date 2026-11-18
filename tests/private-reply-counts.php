<?php
// Native WP REST dispatch with synthetic identity/connection and intercepted service HTTP.
defined('ABSPATH') || exit;
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator');
$admin = wp_get_current_user();
$connection = ['project' => '11111111-1111-4111-8111-111111111111', 'token' => 'fp_synthetic', 'site_url' => FeedbackPress\Service::home(), 'service' => 'https://service.example.test'];
$mode = 'admins'; $calls = 0;
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack($connection));
add_filter('pre_option_feedbackpress_settings', function () use (&$mode) { return ['mode' => $mode]; });
add_filter('pre_http_request', function ($result, $args, $url) use (&$calls) {
    if (!str_ends_with($url, '/note-counts') || $args['method'] !== 'GET') throw new RuntimeException('Unexpected service request');
    $actor = FeedbackPress\Service::unpack($args['headers']['X-FeedbackPress-Actor'] ?? '');
    if (($actor['email'] ?? '') !== strtolower(wp_get_current_user()->user_email)) throw new RuntimeException('Actor not resolved from WordPress');
    $calls++;
    return ['headers' => [], 'response' => ['code' => 200, 'message' => 'OK'], 'body' => '{"counts":[{"issue_id":"11111111-1111-4111-8111-111111111111","count":2}]}'];
}, 10, 3);
$check = function ($value) { if (!$value) throw new RuntimeException('Native private reply-count assertion failed'); };
$request = new WP_REST_Request('GET', '/feedbackpress/v1/reply-counts');
// Supplied guest attribution must not replace the authenticated actor.
$request->set_param('author_email', 'unrelated@example.test');
$response = apply_filters('rest_post_dispatch', rest_do_request($request), rest_get_server(), $request);
$check($response->get_status() === 200 && $response->get_data()['counts'][0]['count'] === 2 && $calls === 1);
$check(str_contains($response->get_headers()['Cache-Control'], 'no-store'));
wp_set_current_user(0); $mode = 'everyone';
$check(rest_do_request($request)->get_status() === 403 && $calls === 1);
wp_set_current_user($admin->ID); $mode = 'disabled';
$check(rest_do_request($request)->get_status() === 403 && $calls === 1);
echo "PASS native REST count access, server-resolved actor, no-store headers and guest/disabled denial before HTTP; no feedback or connection writes.\n";
