<?php
// Run against npm run dev using a private connection file; never changes saved WordPress connections.
if (!str_contains(home_url(), 'feedbackpress-qa-') || !current_user_can('manage_options')) throw new RuntimeException('Disposable QA site and explicit administrator required.');
$file = getenv('FEEDBACKPRESS_ANCHOR_FIXTURE');
$fixture = $file ? json_decode(file_get_contents($file), true) : null;
if (!$fixture || ($fixture['origin'] ?? '') !== 'http://127.0.0.1:8791') throw new RuntimeException('An isolated local dev connection file is required.');
if (!defined('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE')) define('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE', true);
$connection = FeedbackPress\Service::pack(['v' => 3, 'service' => $fixture['origin'], 'project' => $fixture['project_id'], 'token' => $fixture['token'], 'site_url' => FeedbackPress\Service::home()]);
$filter = fn() => $connection;
add_filter('pre_option_' . FeedbackPress\Service::OPTION, $filter);
function anchor_call($method, $path, $body = [], $key = null) {
    $request = new WP_REST_Request($method, '/feedbackpress/v1' . $path); $request->set_header('Idempotency-Key', $key ?? wp_generate_uuid4());
    foreach ($body as $k => $v) $request->set_param($k, $v);
    $result = rest_do_request($request);
    if ($result->get_status() >= 400) throw new RuntimeException('Fixture gateway HTTP ' . $result->get_status() . ': ' . ($result->get_data()['message'] ?? 'failed'));
    return $result->get_data();
}
function anchor_check($value, $message) { if (!$value) throw new RuntimeException($message); }
try {
    $target = ['selector' => 'footer a', 'text' => 'Fixture footer', 'x' => .4, 'y' => .6,
        'fingerprint' => ['version' => 1, 'tag' => 'a', 'id' => '', 'selectors' => ['footer a', 'a.brand'], 'classes' => ['brand'], 'href' => '/about/', 'src' => '', 'landmark' => ['tag' => 'footer', 'selector' => 'footer', 'id' => '']],
        'page' => ['x' => 450, 'y' => 1200, 'width' => 1280, 'height' => 2000]];
    if (str_contains(home_url(), 'feedbackpress-qa-a.')) {
        $key = wp_generate_uuid4(); $body = ['title' => 'Layered anchor gateway', 'path' => '/index.php?view=alpha&filter=x%20y&filter=z', 'target' => $target];
        $issue = anchor_call('POST', '/issues', $body, $key);
        anchor_check(anchor_call('POST', '/issues', $body, $key)['id'] === $issue['id'], 'Retry duplicated issue.');
        $note = anchor_call('POST', '/issues/' . $issue['id'] . '/notes', ['body' => 'Explicitly published fixture', 'agent' => 'Fixture']);
        $legacy = new WP_REST_Request('POST', '/feedbackpress/v1/issues/' . $issue['id'] . '/notes/' . $note['id'] . '/convert');
        $legacy->set_param('revision', $note['revision']); $legacy->set_header('Idempotency-Key', wp_generate_uuid4());
        anchor_check(rest_do_request($legacy)->get_status() === 400, 'Old private-conversion payload could publish.');
        $converted = anchor_call('POST', '/issues/' . $issue['id'] . '/notes/' . $note['id'] . '/convert', ['revision' => $note['revision'], 'publish' => true]);
        anchor_check(($converted['visibility'] ?? '') === 'shared' && $converted['body'] === $note['body'] && $converted['created_at'] === $note['created_at'], 'Conversion failed.');
        anchor_check(isset($converted['issue']['activity']) && !isset($converted['issue']['comments']), 'Conversion response bypassed WordPress shared-view sanitization.');
        $fixture['anchor_issue'] = $issue['id']; file_put_contents($file, wp_json_encode($fixture)); chmod($file, 0600);
    }
    $issue = anchor_call('GET', '/issues/' . $fixture['anchor_issue']);
    anchor_check($issue['path'] === '/index.php?view=alpha&filter=x%20y&filter=z', 'Query parameters changed.');
    anchor_check($issue['target'] == $target, 'Fingerprint/page position did not survive the gateway.');
    anchor_check(str_contains(wp_json_encode($issue['activity']), 'Explicitly published fixture'), 'Converted note missing from shared thread.');
    wp_set_current_user(0);
    anchor_check(str_contains(wp_json_encode(anchor_call('GET', '/issues/' . $issue['id'])), 'Explicitly published fixture'), 'Converted shared note missing for guest.');
    $denied = rest_do_request(new WP_REST_Request('GET', '/feedbackpress/v1/issues/' . $issue['id'] . '/notes'));
    anchor_check($denied->get_status() === 403, 'Guest received private note access.');
    WP_CLI::success('Local gateway fingerprint/query round trip, idempotency, explicit shared conversion and guest/private separation. Saved connection options unchanged.');
} finally { remove_filter('pre_option_' . FeedbackPress\Service::OPTION, $filter); }
