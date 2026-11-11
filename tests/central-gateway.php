<?php
// Run only on disposable fixtures: wp --user=admin eval-file tests/central-gateway.php
if (!str_contains(home_url(), 'feedbackpress-qa-')) throw new RuntimeException('Disposable FeedbackPress QA site required.');
function check($value, $message) { if (!$value) throw new RuntimeException($message); }
function call_api($method, $path, $body = [], $key = null) {
    $r = new WP_REST_Request($method, '/feedbackpress/v1' . $path); $r->set_header('Idempotency-Key', $key ?? wp_generate_uuid4());
    foreach ($body as $k => $v) $r->set_param($k, $v);
    $response = rest_do_request($r);
    if ($response->get_status() >= 400) throw new RuntimeException(wp_json_encode($response->get_data()));
    return $response->get_data();
}
$tables_before = $GLOBALS['wpdb']->get_col("SHOW TABLES LIKE '%feedbackpress%'");
$key = wp_generate_uuid4();
$body = ['title' => 'Central gateway test ' . substr($key, 0, 8), 'body' => '', 'path' => '/', 'target' => ['selector' => 'h1', 'text' => 'Heading', 'x' => .5, 'y' => .5]];
$issue = call_api('POST', '/issues', $body, $key); $again = call_api('POST', '/issues', $body, $key);
check($issue['id'] === $again['id'] && is_int($issue['number']), 'Idempotent creation / sequential number failed.');
check($issue['body'] === '' && $issue['author'] === wp_get_current_user()->display_name, 'Optional description / author failed.');
$reply = call_api('POST', '/issues/' . $issue['id'] . '/replies', ['body' => 'Searchable gateway reply zebracoconut', 'revision' => $issue['revision']]);
check($reply['reply_id'] !== $issue['id'], 'Reply ID failed.');
$found = call_api('GET', '/issues', ['search' => 'zebracoconut', 'status' => 'todo,review']);
check(in_array($issue['id'], array_column($found['issues'], 'id'), true), 'Reply search failed.');
$note = call_api('POST', '/issues/' . $issue['id'] . '/notes', ['body' => 'Private fixture note velvetbadger', 'agent' => 'Fixture Agent']);
check(count(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes']) === 1 && $note['author_kind'] === 'agent', 'Private note creation failed.');
$public = call_api('GET', '/issues/' . $issue['id']);
check(!str_contains(wp_json_encode($public), 'velvetbadger'), 'Private note leaked publicly.');
$converted = call_api('POST', '/issues/' . $issue['id'] . '/notes/' . $note['id'] . '/convert', ['revision' => $note['revision']]);
check($converted['author_kind'] === 'human' && $converted['created_at'] === $note['created_at'] && $converted['body'] === $note['body'], 'Conversion changed body/time.');
$admin = get_current_user_id(); $other = get_user_by('email', 'other@feedbackpress.test');
if (!$other) { $uid = wp_insert_user(['user_login' => 'other-reviewer', 'user_email' => 'other@feedbackpress.test', 'user_pass' => wp_generate_password(), 'role' => 'subscriber']); $other = get_user_by('id', $uid); }
wp_set_current_user($other->ID);
check(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes'] === [], 'Other email saw notes.');
wp_set_current_user(0); $r = new WP_REST_Request('GET', '/feedbackpress/v1/issues/' . $issue['id'] . '/notes');
check(rest_do_request($r)->get_status() === 403, 'Guest could read private notes.');
$guest = call_api('GET', '/issues/' . $issue['id']);
check(!str_contains(wp_json_encode($guest), '@') && !str_contains(wp_json_encode($guest), 'velvetbadger'), 'Guest identity/private data leak.');
wp_set_current_user($admin);
$done = call_api('POST', '/issues/' . $issue['id'] . '/status', ['status' => 'done', 'revision' => $reply['revision']]);
check($done['status'] === 'done', 'Status update failed.');
check($GLOBALS['wpdb']->get_col("SHOW TABLES LIKE '%feedbackpress%'") === $tables_before, 'Plugin created local feedback tables.');
update_option('feedbackpress_qa_last_issue', $issue['id'], false);
WP_CLI::success('Central gateway: create/retry, optional description, reply/search, author, private ownership/conversion, guest isolation, status, no local tables.');
