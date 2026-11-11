<?php
// wp --user=admin eval-file tests/project-management.php; disposable connected fixtures only.
if (!str_contains(home_url(), 'feedbackpress-qa-')) throw new RuntimeException('Disposable QA fixture required.');
$original = FeedbackPress\Service::connection();
if (empty($original['project'])) throw new RuntimeException('Connect the fixture first.');
function management($path, $body = null) {
    $r = new WP_REST_Request($body === null ? 'GET' : 'POST', '/feedbackpress/v1/admin/' . $path);
    foreach ($body ?? [] as $k => $v) $r->set_param($k, $v);
    $response = rest_do_request($r);
    if ($response->get_status() !== 200) throw new RuntimeException('Management HTTP ' . $response->get_status() . ': ' . ($response->get_data()['message'] ?? 'failed'));
    return $response->get_data();
}
function must($value, $message) { if (!$value) throw new RuntimeException($message); }
try {
    $before = FeedbackPress\Service::snapshot();
    $projects = management('projects'); must(count($projects) > 0, 'Project listing failed.');
    $id = wp_generate_uuid4(); $body = ['id' => $id, 'name' => 'Disposable management ' . substr($id, 0, 8)];
    $created = management('project/new', $body);
    must($created['project']['id'] === $id && count(FeedbackPress\Service::snapshot()['issues']) === 0, 'New project isolation failed.');
    $old = FeedbackPress\Service::manager('GET', '/projects/' . $original['project']);
    must(!in_array(FeedbackPress\Service::home(), array_column($old['sites'], 'url')), 'Switch did not detach old membership.');
    management('project/new', $body);
    must(count(array_filter(management('projects'), fn($p) => $p['id'] === $id)) === 1, 'Creation retry duplicated project.');
    $removed = management('site/remove', ['url' => FeedbackPress\Service::home()]);
    must($removed['disconnected'] && !$removed['project']['sites'], 'Site removal failed.');
    try { FeedbackPress\Service::snapshot(); throw new RuntimeException('Removed copy retained feedback access.'); }
    catch (RuntimeException $e) { must($e->getCode() === 503, 'Unexpected removed access response.'); }
    management('project', ['project' => $id]);
    must(count(FeedbackPress\Service::snapshot()['issues']) === 0, 'Explicit reconnect failed.');
    try { FeedbackPress\Service::manager('GET', '/projects/' . $id . '/snapshot'); throw new RuntimeException('Manager directly read feedback.'); }
    catch (FeedbackPress\RemoteError $e) { must($e->getCode() === 403, 'Manager scope failed.'); }
    wp_set_current_user(0); $r = new WP_REST_Request('GET', '/feedbackpress/v1/admin/projects');
    must(rest_do_request($r)->get_status() === 403, 'Guest could manage account.');
    wp_set_current_user(1);
    WP_CLI::success('Account projects, isolated creation/retry, switching/detachment, removal/reconnect, limited manager scope, and guest denial.');
} finally {
    FeedbackPress\Service::selectProject($original['project']);
    if (isset($before)) must(array_column(FeedbackPress\Service::snapshot()['issues'], 'id') === array_column($before['issues'], 'id'), 'Original feedback changed.');
}
