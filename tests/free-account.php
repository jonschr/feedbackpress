<?php
// Native WordPress, intercepted HTTP/options; no real account, connection or provider writes.
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator explicitly.');
require dirname(__DIR__) . '/feedbackpress.php';
$option = FeedbackPress\Service::OPTION;
$pendingOption = 'feedbackpress_signup_pending';
$before = get_option($option);
$beforePending = get_option($pendingOption, false);
if ($beforePending !== false) throw new RuntimeException('Use a disposable fixture without a pending signup.');
$out = getenv('FP_FREE_TEST_RECEIPT');
if (!$out || !is_dir($out) || !str_starts_with(realpath($out), rtrim(getenv('HOME'), '/') . '/Library/Application Support/FeedbackPress/private/')) throw new RuntimeException('Private receipt directory required');
file_put_contents($out . '/' . wp_parse_url(home_url(),PHP_URL_HOST) . '-free-native-options-before.json', wp_json_encode(['connection'=>$before,'pending'=>$beforePending]));chmod($out . '/' . wp_parse_url(home_url(),PHP_URL_HOST) . '-free-native-options-before.json',0600);
$connection = FeedbackPress\Service::pack(['service' => 'https://service.example.test']);
$pending = []; $keys = []; $attempt = 0;
$read = function ($pre, $name) use (&$connection, &$pending, $option, $pendingOption) { return $name === $option ? $connection : ($name === $pendingOption ? $pending : $pre); };
$write = function ($value, $name, $old) use (&$connection, &$pending, $option, $pendingOption) {
    if ($name === $option) { $connection = $value; return $old; }
    if ($name === $pendingOption) { $pending = $value; return $old; }
    if ($name === 'feedbackpress_service_log_v2') return $old;
    return $value;
};
$remove = function ($name) use (&$pending, $pendingOption) { if ($name === $pendingOption) $pending = []; };
$http = function ($pre, $args, $url) use (&$keys, &$attempt, &$pending) {
    $path = wp_parse_url($url, PHP_URL_PATH); $status = 200; $data = [];
    if ($path === '/v1/accounts/free') {
        $body = json_decode($args['body'], true); $keys[] = $body['key'];
        if (++$attempt === 1) { $status = 503; $data = ['error' => 'service_unavailable']; }
        else $data = ['account_id' => $body['id']];
    } elseif ($path === '/v1/account') $data = ['id' => $pending['id']];
    elseif ($path === '/v1/account/connections') $data = ['id' => wp_generate_uuid4(), 'token' => 'fp_' . str_repeat('m', 43)];
    else throw new RuntimeException('Unexpected service request');
    return ['response' => ['code' => $status], 'headers' => [], 'body' => wp_json_encode($data), 'cookies' => []];
};
add_filter('pre_option', $read, 10, 2); add_filter('pre_update_option', $write, 10, 3); add_action('delete_option', $remove); add_filter('pre_http_request', $http, 10, 3);
try {
    try { FeedbackPress\Service::startFree(); throw new RuntimeException('Expected a retryable outage'); }
    catch (FeedbackPress\RemoteError $e) { if ($e->getCode() !== 503) throw $e; }
    $result = FeedbackPress\Service::startFree();
    if (count($keys) !== 2 || $keys[0] !== $keys[1] || $keys[1] !== $result['key']) throw new RuntimeException('Signup retry rotated the key');
    if (str_contains(wp_json_encode(FeedbackPress\Service::connection()), $result['key'])) throw new RuntimeException('Root key retained in the established connection');
    $saved = $connection;
    try { FeedbackPress\Service::startFree(); throw new RuntimeException('Connected installation was overwritten'); }
    catch (RuntimeException $e) { if (!str_contains($e->getMessage(), 'already has an account')) throw $e; }
    if ($connection !== $saved) throw new RuntimeException('Established connection changed');
} finally {
    remove_filter('pre_option', $read, 10); remove_filter('pre_update_option', $write, 10); remove_action('delete_option', $remove); remove_filter('pre_http_request', $http, 10);
}
if (get_option($option) !== $before || get_option($pendingOption, false) !== $beforePending) throw new RuntimeException('Real options changed');
WP_CLI::success('Free signup retries retain the same key; root key returned once, pending state cleared and existing connection preserved. All HTTP/options intercepted.');
