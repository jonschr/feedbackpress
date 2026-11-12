<?php
// Run with WP-CLI --skip-plugins=feedbackpress --user=admin; intercepts all service HTTP.
if (!current_user_can('manage_options')) throw new RuntimeException('Explicit administrator required.');
require dirname(__DIR__) . '/feedbackpress.php';
$before = get_option(FeedbackPress\Service::OPTION);
$intercept = function ($pre, $args, $url) {
    if ($url !== 'https://service.example.test/v1/account') throw new RuntimeException('Unexpected fixture request.');
    return ['response' => ['code' => 401, 'message' => 'Unauthorized'], 'headers' => [], 'body' => '{"error":"unauthorized"}', 'cookies' => []];
};
add_filter('pre_http_request', $intercept, 10, 3);
try {
    try { FeedbackPress\Service::connectAccount('https://service.example.test', 'fp_' . str_repeat('x', 43)); throw new RuntimeException('Rejected key was accepted.'); }
    catch (FeedbackPress\RemoteError $e) {
        if ($e->getCode() !== 401 || !str_contains($e->getMessage(), 'existing connection is unchanged')) throw $e;
    }
    if (get_option(FeedbackPress\Service::OPTION) !== $before) throw new RuntimeException('Rejected key altered the connection.');
    WP_CLI::success('Rejected account key has a specific recovery message and preserves the saved connection. No real HTTP request.');
} finally { remove_filter('pre_http_request', $intercept, 10); }
