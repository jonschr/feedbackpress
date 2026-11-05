<?php
// Run with: wp --path=/path/to/wordpress eval-file /path/to/feedbackpress/tests/integration.php
use FeedbackPress\Store;
use FeedbackPress\API;
use FeedbackPress\Sync;
function fp_check($ok, $message) { if (!$ok) throw new RuntimeException($message); echo "PASS $message\n"; }
$ids = []; $original = FeedbackPress\settings();
function fp_request($method, $path, $data = [], $key = true) {
    $r = new WP_REST_Request($method, '/feedbackpress/v1/' . $path);
    if ($key) $r->set_header('X-FeedbackPress-Key', FeedbackPress\settings()['secret']);
    foreach ($data as $k => $v) $r->set_param($k, $v);
    return rest_do_request($r);
}
try {
    wp_set_current_user(0);
    $response = fp_request('POST', 'issues', ['author' => 'Integration test', 'body' => 'Replace this headline.', 'path' => '/fp-test/', 'target' => ['selector' => 'h1', 'text' => 'Headline', 'x' => .5, 'y' => .5]]);
    $issue = $response->get_data(); $ids[] = $issue['id'];
    fp_check($response->get_status() === 201 && $issue['status'] === 'todo', 'New feedback starts in To do');
    fp_check(is_string($issue['number']) && ctype_digit($issue['number']), 'Issues receive a persistent local pin number');
    fp_check(Sync::validate(Store::events($issue['id'])[0]), 'Issue numbers travel in valid sync events');
    fp_check(fp_request('POST', 'issues', ['author' => '', 'body' => 'x', 'path' => '/', 'target' => []])->get_status() === 400, 'Name is required');
    fp_check(fp_request('POST', 'issues', ['author' => 'test', 'body' => 'x', 'path' => '//evil.example', 'target' => []])->get_status() === 400, 'External page paths are rejected');
    $reply_response = fp_request('POST', 'issues/' . $issue['id'] . '/replies', ['author' => 'Client', 'body' => 'Please use the new wording.']);
    fp_check($reply_response->get_status() === 200, 'Replies are saved');
    $reply_id = $reply_response->get_data()['reply_id'];
    fp_check(Store::uuid($reply_id) && $reply_response->get_data()['activity'][0]['id'] === $reply_id, 'Reply responses expose the stable comment ID');
    $bad_comment = fp_request('POST', 'issues/' . $issue['id'] . '/files', ['comment_id' => wp_generate_uuid4()]);
    fp_check($bad_comment->get_status() === 400 && str_contains($bad_comment->get_data()['message'], 'belong'), 'Uploads reject comment references outside the issue');
    $first = fp_request('POST', 'issues/' . $issue['id'] . '/status', ['author' => 'Agent', 'status' => 'doing', 'revision' => $issue['revision']]);
    fp_check($first->get_data()['status'] === 'doing', 'Agents can change status');
    fp_check(fp_request('POST', 'issues/' . $issue['id'] . '/status', ['author' => 'Agent', 'status' => 'done', 'revision' => $issue['revision']])->get_status() === 409, 'Stale status writes are rejected');
    $concurrent = ['id' => wp_generate_uuid4(), 'issue_id' => $issue['id'], 'kind' => 'status', 'payload' => ['author' => 'Offline reviewer', 'status' => 'done', 'parents' => $issue['heads']], 'created_at' => gmdate('Y-m-d\TH:i:s\Z'), 'environment' => 'staging'];
    fp_check(Sync::validate($concurrent), 'Valid sync events are accepted');
    Store::insert($concurrent); Store::insert($concurrent);
    $conflict = Store::issue($issue['id']);
    fp_check($conflict['conflict'] && $conflict['status'] === 'review' && count($conflict['heads']) === 2, 'Concurrent statuses are preserved and flagged for Review');
    $resolved = fp_request('POST', 'issues/' . $issue['id'] . '/status', ['author' => 'Client', 'status' => 'done', 'revision' => $conflict['revision']])->get_data();
    fp_check(!$resolved['conflict'] && $resolved['status'] === 'done', 'Choosing a status resolves competing changes');
    $pdf = "%PDF-1.4\n%%EOF";
    $file = Store::append($issue['id'], 'file', ['name' => 'test.pdf', 'mime' => 'application/pdf', 'size' => strlen($pdf), 'sha256' => hash('sha256', $pdf), 'expires_at' => time() + 3600, 'screenshot' => false, 'comment_id' => $reply_id]);
    fp_check(Store::put_file($file['id'], $pdf), 'Attachments are stored outside the media library');
    fp_check(Store::issue($issue['id'])['files'][0]['comment_id'] === $reply_id && Sync::validate($file), 'Attachment comment references survive storage and sync validation');
    $legacy_file = $file; unset($legacy_file['payload']['comment_id']);
    fp_check(Sync::validate($legacy_file) && Store::reduce([Store::events($issue['id'])[0], $legacy_file])['files'][0]['comment_id'] === $issue['id'], 'Legacy attachments fall back to the original comment');
    $invalid_file = $file; $invalid_file['payload']['comment_id'] = 'invalid';
    fp_check(!Sync::validate($invalid_file), 'Sync rejects malformed attachment comment IDs');
    fp_check(!Store::put_file($file['id'], 'wrong bytes'), 'Attachment checksum mismatches are rejected');
    Store::append($issue['id'], 'expire', ['file_id' => $file['id']]); Store::cleanup();
    fp_check(!is_file(Store::file_path($file['id'])) && !Store::put_file($file['id'], $pdf), 'Expired attachments cannot be resurrected');
    $private = $original; $private['mode'] = 'admins'; update_option('feedbackpress_settings', $private);
    fp_check(fp_request('GET', 'issues', [], false)->get_status() === 403, 'Private mode blocks anonymous API reads');
    fp_check(fp_request('GET', 'files/' . $file['id'], [], false)->get_status() === 403, 'Private mode blocks anonymous attachment downloads');
    fp_check(fp_request('GET', 'issues')->get_status() === 200, 'Project key can read private feedback');
    fp_check(fp_request('GET', 'sync/events', [], false)->get_status() === 403, 'Sync always requires authentication');
    update_option('feedbackpress_settings', $original);
    fp_check(fp_request('POST', 'issues', [], false)->get_status() === 403, 'Public writes require a browser nonce or agent credentials');
    fp_check(!Sync::validate(['id' => 'bad']), 'Malformed sync events are rejected');
    $admin = get_users(['role' => 'administrator', 'number' => 1])[0];
    wp_set_current_user($admin->ID);
    $account = fp_request('POST', 'issues', ['author' => 'Browser-supplied override', 'body' => 'Logged-in identity test.', 'path' => '/fp-test/', 'target' => []], false);
    $ids[] = $account->get_data()['id'];
    fp_check((int) $account->get_data()['number'] > (int) $issue['number'] && Store::issue($issue['id'])['number'] === $issue['number'], 'Adding another issue never changes an existing pin number');
    fp_check($account->get_status() === 201 && $account->get_data()['author'] === $admin->display_name, 'Logged-in feedback uses the WordPress display name');
    do_action('wp_enqueue_scripts');
    $config = wp_scripts()->get_data('feedbackpress', 'data');
    preg_match('/var FeedbackPressConfig = (.*);/', $config, $match);
    fp_check((json_decode($match[1], true)['userName'] ?? '') === $admin->display_name, 'Frontend receives the logged-in WordPress display name');
    wp_set_current_user(0);
    fp_check(!API::valid_file('<svg onload="alert(1)"></svg>', 'image/svg+xml'), 'Active SVG uploads are rejected');
    fp_check(!API::valid_file('not a png', 'image/png'), 'Mislabeled image content is rejected');
    fp_check(Store::reduce(array_reverse(Store::events($issue['id'])))['revision'] === Store::issue($issue['id'])['revision'], 'Status reduction is independent of arrival order');
    fp_check(Store::reduce(array_reverse(Store::events($issue['id'])))['number'] === $issue['number'], 'Event arrival order does not change issue numbers');
    $root = Store::events($issue['id'])[0]; unset($root['payload']['number']);
    $assignment = ['id' => wp_generate_uuid4(), 'issue_id' => $issue['id'], 'kind' => 'number', 'payload' => ['number' => 'S123'], 'created_at' => gmdate('Y-m-d\TH:i:s\Z'), 'environment' => 'staging'];
    fp_check(Sync::validate($assignment) && Store::reduce([$assignment, $root])['number'] === 'S123', 'Legacy numbering assignments remain stable when synchronized');
    $order_ids = [];
    for ($n = 1; $n <= 52; $n++) {
        $id = wp_generate_uuid4(); $ids[] = $id; $order_ids[] = $id;
        Store::insert(['id' => wp_generate_uuid4(), 'issue_id' => $id, 'kind' => 'issue', 'payload' => ['author' => 'Integration test', 'body' => 'Ordering fixture', 'number' => 'S' . $n, 'path' => '/fp-pagination/', 'target' => ['selector' => '', 'text' => '', 'x' => .5, 'y' => .5], 'context' => []], 'created_at' => gmdate('Y-m-d\TH:i:s\Z'), 'environment' => 'staging']);
    }
    $ordered = fp_request('GET', 'issues', ['path' => '/fp-pagination/', 'order' => 'number'])->get_data();
    fp_check(count($ordered['issues']) === 50 && $ordered['issues'][0]['number'] === 'S1' && $ordered['issues'][9]['number'] === 'S10', 'Natural issue-number sorting happens before pagination');
    $focused = fp_request('GET', 'issues', ['path' => '/fp-pagination/', 'order' => 'number', 'focus' => $order_ids[51]])->get_data();
    fp_check($focused['page'] === 2 && $focused['issues'][1]['id'] === $order_ids[51], 'Focused issues select the correct list page');
    $last_page = fp_request('GET', 'issues', ['path' => '/fp-pagination/', 'page' => 100])->get_data();
    fp_check($last_page['page'] === 2 && count($last_page['issues']) === 2, 'List pagination clamps to an available page');
    $grouped = fp_request('GET', 'issues', ['order' => 'page'])->get_data()['issues'];
    $sorted = $grouped; usort($sorted, fn($a, $b) => strnatcasecmp($a['path'], $b['path']) ?: strnatcasecmp($a['number'], $b['number']) ?: strcmp($a['id'], $b['id']));
    fp_check(array_column($grouped, 'id') === array_column($sorted, 'id'), 'Page ordering groups paths then issue numbers');

} finally {
    update_option('feedbackpress_settings', $original);
    global $wpdb;
    foreach ($ids as $id) $wpdb->delete(Store::table(), ['issue_id' => $id]);
}
echo "FeedbackPress integration checks passed. Test issues removed.\n";
