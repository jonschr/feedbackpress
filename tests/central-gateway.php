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
$note = call_api('POST', '/issues/' . $issue['id'] . '/notes', ['body' => 'Shared-on-conversion amberfox', 'agent' => 'Fixture Agent']);
check(count(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes']) === 1 && $note['author_kind'] === 'agent', 'Private note creation failed.');
$public = call_api('GET', '/issues/' . $issue['id']);
check(!str_contains(wp_json_encode($public), 'amberfox'), 'Private note leaked publicly.');
$converted = call_api('POST', '/issues/' . $issue['id'] . '/notes/' . $note['id'] . '/convert', ['revision' => $note['revision'], 'publish' => true]);
check($converted['visibility'] === 'shared' && $converted['author_kind'] === 'human' && $converted['created_at'] === $note['created_at'] && $converted['body'] === $note['body'], 'Conversion changed body/time.');
check(str_contains(wp_json_encode(call_api('GET', '/issues/' . $issue['id'])), 'amberfox'), 'Converted note is not shared.');
call_api('POST', '/issues/' . $issue['id'] . '/notes', ['body' => 'Private fixture note velvetbadger', 'kind' => 'human']);
$admin = get_current_user_id(); $other = get_user_by('email', 'other@feedbackpress.test');
if (!$other) { $uid = wp_insert_user(['user_login' => 'other-reviewer', 'user_email' => 'other@feedbackpress.test', 'user_pass' => wp_generate_password(), 'role' => 'subscriber']); $other = get_user_by('id', $uid); }
wp_set_current_user($other->ID);
check(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes'] === [], 'Other email saw notes.');
wp_set_current_user(0); $r = new WP_REST_Request('GET', '/feedbackpress/v1/issues/' . $issue['id'] . '/notes');
check(rest_do_request($r)->get_status() === 403, 'Guest could read private notes.');
$guest = call_api('GET', '/issues/' . $issue['id']);
check(!str_contains(wp_json_encode($guest), '@') && !str_contains(wp_json_encode($guest), 'velvetbadger'), 'Guest identity/private data leak.');
wp_set_current_user($admin);
$owner_email = wp_get_current_user()->user_email;
$spoof = new WP_REST_Request('GET', '/feedbackpress/v1/issues/' . $issue['id'] . '/notes');
$spoof->set_header('X-FeedbackPress-Actor', rtrim(strtr(base64_encode(wp_json_encode(['name' => 'Spoof', 'email' => $owner_email])), '+/', '-_'), '='));
$spoof->set_param('actor', ['email' => $owner_email]); $spoof->set_param('author_email', $owner_email);
wp_set_current_user($other->ID);
check(rest_do_request($spoof)->get_data()['notes'] === [], 'Supplied actor overrode WordPress identity.');
wp_set_current_user(0);
check(rest_do_request($spoof)->get_status() === 403, 'Guest spoof authorized private access.');
wp_set_current_user($admin);
check(count(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes']) === 1, 'Owner access did not recover after account switching.');
// Prevent WordPress account-change notifications from leaving the disposable fixture.
$intercept_mail = fn() => true; add_filter('pre_wp_mail', $intercept_mail);
try {
    $changed = wp_update_user(['ID' => $admin, 'user_email' => 'changed-' . substr($key, 0, 8) . '@feedbackpress.test']);
    check(!is_wp_error($changed), 'Fixture email change failed.');
    wp_set_current_user(0); wp_set_current_user($admin);
    check(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes'] === [], 'Changed WordPress email retained old private access.');
} finally {
    wp_update_user(['ID' => $admin, 'user_email' => $owner_email]);
    wp_set_current_user(0); wp_set_current_user($admin);
    remove_filter('pre_wp_mail', $intercept_mail);
}
check(count(call_api('GET', '/issues/' . $issue['id'] . '/notes')['notes']) === 1, 'Restored email did not recover matching access.');
$shared_search = call_api('GET', '/issues', ['search' => 'velvetbadger', 'status' => 'todo,review']);
check($shared_search['issues'] === [], 'Private note entered shared search.');
$cache_response = rest_do_request(new WP_REST_Request('GET', '/feedbackpress/v1/issues/' . $issue['id'] . '/notes'));
$cache_response = apply_filters('rest_post_dispatch', $cache_response, rest_get_server(), $spoof);
check(str_contains($cache_response->get_headers()['Cache-Control'] ?? '', 'no-store'), 'Private response allowed caching.');
$done = call_api('POST', '/issues/' . $issue['id'] . '/status', ['status' => 'done', 'revision' => call_api('GET', '/issues/' . $issue['id'])['revision']]);
check($done['status'] === 'done', 'Status update failed.');
check($GLOBALS['wpdb']->get_col("SHOW TABLES LIKE '%feedbackpress%'") === $tables_before, 'Plugin created local feedback tables.');
update_option('feedbackpress_qa_last_issue', $issue['id'], false);
WP_CLI::success('Central gateway: create/retry, optional description, reply/search, author, private ownership/conversion, guest/spoof isolation, account/email switching, private search/cache isolation, status, no local tables.');
