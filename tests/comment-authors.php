<?php
// Native WordPress routing with synthetic service responses; no feedback or settings writes.
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON', true);
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\Service;
use FeedbackPress\Identity;
$admin = wp_get_current_user();
$id = '11111111-1111-4111-8111-111111111111';
$reply = '22222222-2222-4222-8222-222222222222';
$person = ['id' => Identity::id('replacement@example.test'), 'name' => 'Replacement', 'email' => 'replacement@example.test'];
$connection = ['project' => $id, 'token' => 'fp_synthetic', 'site_url' => Service::home(), 'service' => 'https://service.example.test'];
$calls = []; $status = 200;
add_filter('pre_option_' . Service::OPTION, fn() => Service::pack($connection));
add_filter('pre_option_feedbackpress_settings', fn() => ['mode' => 'everyone']);
add_filter('pre_http_request', function ($pre, $args, $url) use (&$calls, &$status, $id, $reply, $person) {
    if (!str_starts_with($url, 'https://service.example.test/')) return new WP_Error('fixture_network_blocked', 'Unrelated HTTP blocked.');
    $calls[] = ['url' => $url, 'method' => $args['method'], 'body' => json_decode($args['body'] ?? 'null', true), 'key' => $args['headers']['Idempotency-Key'] ?? ''];
    if (str_ends_with($url, '/people')) $data = [$person];
    elseif (str_contains($url, '/authors/')) {
        $data = ['id' => $id, 'number' => 1, 'path' => '/', 'revision' => 8, 'comments' => [
            ['id' => $id, 'author' => ['id' => 'root', 'name' => 'Original'], 'body' => 'Issue', 'edited_at' => null],
            ['id' => $reply, 'author' => $person, 'owner_id' => 'immutable-owner', 'body' => 'Reply', 'edited_at' => null, 'created_at' => '2026-11-19T12:00:00Z'],
        ], 'media' => []];
        if ($status !== 200) $data = ['error' => 'stale_revision'];
    } else throw new RuntimeException('Unexpected HTTP request');
    return ['headers' => [], 'response' => ['code' => str_ends_with($url, '/people') ? 200 : $status], 'body' => wp_json_encode($data)];
}, 10, 3);
$check = function ($value) { if (!$value) throw new RuntimeException('Comment author assertion failed at line ' . debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 1)[0]['line']); };
$send = function ($path, $author) {
    $request = new WP_REST_Request('POST', '/feedbackpress/v1/issues/' . $path);
    $request->set_header('Idempotency-Key', '33333333-3333-4333-8333-333333333333');
    $request->set_param('author_id', $author);
    $request->set_param('revision', '7');
    $request->set_param('author', ['email' => 'forged@example.test']);
    $request->set_query_params(['comment_id' => 'forged-target']);
    return rest_do_request($request);
};
$response = $send($id . '/comments/' . $reply . '/author', $person['id']);
$check($response->get_status() === 200);
$check(str_ends_with($calls[1]['url'], '/issues/' . $id . '/authors/' . $reply) && $calls[1]['method'] === 'PATCH');
$check($calls[1]['body'] === ['revision' => 7, 'author' => $person] && $calls[1]['key'] === '33333333-3333-4333-8333-333333333333');
$data = $response->get_data();
$check($data['author'] === 'Original' && $data['activity'][0]['payload']['author'] === 'Replacement' && $data['activity'][0]['payload']['owner_id'] === 'immutable-owner');
$check($send($id . '/author', $person['id'])->get_status() === 200 && str_ends_with(end($calls)['url'], '/authors/' . $id));
$check($send($id . '/comments/' . $reply . '/author', Identity::id($admin->user_email))->get_status() === 200 && end($calls)['body']['author']['email'] === $admin->user_email);
$before = count($calls);
$check($send($id . '/comments/' . $reply . '/author', 'unknown')->get_status() === 400 && count($calls) === $before + 1);
$status = 409;
$check($send($id . '/comments/' . $reply . '/author', $person['id'])->get_status() === 409);
wp_set_current_user(0); $before = count($calls);
try { $check($send($id . '/comments/' . $reply . '/author', $person['id'])->get_status() === 403 && count($calls) === $before); }
finally { wp_set_current_user($admin->ID); }
echo "PASS individual-comment/root author routes, server-resolved people/native users, revision/key forwarding, unchanged ownership, conflicts and unverified guest denial. HTTP intercepted; no feedback/settings writes.\n";
