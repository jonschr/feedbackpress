<?php
// Intercepted WordPress boundary check; no connection saved and no actual HTTP.
if (!current_user_can('manage_options')) throw new RuntimeException('Explicit administrator required.');
require dirname(__DIR__) . '/feedbackpress.php';
$before = get_option(FeedbackPress\Service::OPTION); $seen = false;
$key = 'fp_' . str_repeat('x', 43);
$mock = function ($pre, $args, $url) use (&$seen, $key) {
    $path = wp_parse_url($url, PHP_URL_PATH);
    if ($path === '/v1/account') $body = ['id' => wp_generate_uuid4(), 'owner_linking' => true];
    elseif ($path === '/v1/account/owner') {
        $actor = json_decode(base64_decode(strtr($args['headers']['X-FeedbackPress-Actor'] ?? '', '-_', '+/')), true);
        if (($args['headers']['Authorization'] ?? '') !== 'Bearer ' . $key || ($actor['email'] ?? '') !== strtolower(wp_get_current_user()->user_email)) throw new RuntimeException('Ownership must use the original key and server-resolved WordPress identity.');
        $seen = true; $body = ['verified' => true];
    } elseif ($path === '/v1/account/connections') return new WP_Error('fixture', 'Stop before changing the local connection.');
    else throw new RuntimeException('Unexpected fixture HTTP request.');
    return ['response' => ['code' => 200, 'message' => 'OK'], 'headers' => [], 'body' => wp_json_encode($body), 'cookies' => []];
};
add_filter('pre_http_request', $mock, 10, 3);
try {
    try { FeedbackPress\Service::connectAccount('https://service.example.test', $key); throw new RuntimeException('Fixture failed to stop.'); }
    catch (RuntimeException $e) { if ($e->getCode() !== 503) throw $e; }
    if (!$seen || get_option(FeedbackPress\Service::OPTION) !== $before) throw new RuntimeException('Ownership proof missing or saved connection changed.');
    echo 'PASS account ownership links only with the original key and logged-in WordPress identity; no email field, saved connection change or actual HTTP.';
} finally { remove_filter('pre_http_request', $mock, 10); }
