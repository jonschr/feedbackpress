<?php
// Request-scoped fixture only; no connection or feedback options are replaced.
if (!str_contains(home_url(), 'feedbackpress-qa-') || !current_user_can('manage_options')) throw new RuntimeException('Explicit QA administrator required.');
if (!class_exists('FeedbackPress\\Service')) require dirname(__DIR__) . '/feedbackpress.php';
$file = getenv('FEEDBACKPRESS_MENTION_FIXTURE');
$f = $file ? json_decode(file_get_contents($file), true) : null;
if (!$f || !in_array($f['origin'] ?? '', ['http://127.0.0.1:8791', 'https://feedbackpress.elod.in'], true)) throw new RuntimeException('Private isolated project fixture required.');
$copy = str_contains(home_url(), 'feedbackpress-qa-a.') ? 'a' : 'b';
$original = get_option(FeedbackPress\Service::OPTION);
$actor = get_current_user_id();
if (!defined('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE')) define('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE', true);
$home = fn() => $f['sites'][$copy]['url'];
$connection = fn() => FeedbackPress\Service::pack(['v' => 3, 'service' => $f['origin'], 'project' => $f['project'], 'token' => $f['sites'][$copy]['token'], 'site_url' => $f['sites'][$copy]['url']]);
add_filter('pre_option_home', $home);
add_filter('pre_option_' . FeedbackPress\Service::OPTION, $connection);
function mention_assert($condition, $message) { if (!$condition) throw new RuntimeException($message); }
function mention_call($method, $path, $body = [], $key = null, $status = 200) {
    $r = new WP_REST_Request($method, '/feedbackpress/v1' . $path);
    $r->set_header('Idempotency-Key', $key ?? wp_generate_uuid4());
    $r->set_header('X-WP-Nonce', wp_create_nonce('wp_rest'));
    $r->set_header('Origin', FeedbackPress\Service::home());
    $r->set_header('X-FeedbackPress-Actor', 'forged-browser-actor');
    foreach ($body as $k => $v) $r->set_param($k, $v);
    $response = rest_do_request($r);
    mention_assert($response->get_status() === $status, 'Gateway returned ' . $response->get_status() . ' for ' . $path . ': ' . ($response->get_data()['message'] ?? 'unexpected response'));
    return $response->get_data();
}
try {
    if ($copy === 'a') {
        wp_set_current_user(0);
        $seed = mention_call('POST', '/issues', ['title' => 'Isolated mention gateway', 'body' => 'Shared fixture', 'path' => '/?page_id=7&filter=x%20y&filter=z', 'target' => ['selector' => '', 'x' => 0, 'y' => 0], 'author' => 'Mention Recipient', 'author_email' => 'mention-recipient@example.test']);
        $bank = mention_call('GET', '/mentions');
        mention_assert(count($bank['people']) === 1 && !str_contains(wp_json_encode($bank), '@example.test'), 'Recipient bank leaked email or unrelated identities.');
        wp_set_current_user($actor);
        $body = ['revision' => $seed['revision'], 'body' => 'Please check @Mention Recipient', 'mentions' => [['id' => $bank['people'][0]['id'], 'start' => 13, 'end' => 31, 'email' => 'forged@example.test']], 'author' => 'Forged actor', 'author_email' => 'forged@example.test', 'actor' => ['email' => 'forged@example.test']];
        $key = wp_generate_uuid4();
        $saved = mention_call('POST', '/issues/' . $seed['id'] . '/replies', $body, $key);
        mention_assert(mention_call('POST', '/issues/' . $seed['id'] . '/replies', $body, $key)['reply_id'] === $saved['reply_id'], 'Retry duplicated reply.');
        $reply = end($saved['activity'])['payload'];
        mention_assert($reply['author_id'] === FeedbackPress\Identity::id(wp_get_current_user()->user_email) && $reply['author'] !== 'Forged actor', 'Browser overrode authenticated WordPress author.');
        mention_assert($reply['mentions'] == [['id' => $bank['people'][0]['id'], 'start' => 13, 'end' => 31]], 'Mention metadata did not survive or retained forged email.');
        mention_call('POST', '/issues/' . $seed['id'] . '/notes', ['body' => 'PRIVATE_MENTION_SENTINEL @Mention Recipient', 'agent' => 'Fixture', 'mentions' => $body['mentions']]);
        $f['issue'] = $seed['id']; file_put_contents($file, wp_json_encode($f)); chmod($file, 0600);
    } else {
        $saved = mention_call('GET', '/issues/' . $f['issue']);
        mention_assert(count($saved['activity']) === 1 && !str_contains(wp_json_encode($saved), 'PRIVATE_MENTION_SENTINEL'), 'Shared cross-copy response included private data or duplicated reply.');
        mention_assert(end($saved['activity'])['payload']['mentions'][0]['start'] === 13, 'Cross-copy mention lost.');
        mention_assert($saved['path'] === '/?page_id=7&filter=x%20y&filter=z', 'Query parameters lost.');
        wp_set_current_user(0);
        mention_assert(count(mention_call('GET', '/mentions')['people']) === 2, 'Guest shared commenter bank unavailable.');
        mention_call('GET', '/issues/' . $f['issue'] . '/notes', [], null, 403);
    }
} finally {
    remove_filter('pre_option_home', $home);
    remove_filter('pre_option_' . FeedbackPress\Service::OPTION, $connection);
    mention_assert(get_option(FeedbackPress\Service::OPTION) === $original, 'Saved connection changed.');
    wp_set_current_user($actor);
}
WP_CLI::success('Mention gateway ' . strtoupper($copy) . ': shared ranges/retry, server author, guest/private separation and unchanged saved connection.');
