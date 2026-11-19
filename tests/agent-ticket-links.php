<?php
// Native WordPress / Abilities / CLI with synthetic service responses only.
defined('ABSPATH') || exit;
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator');
$admin = wp_get_current_user(); $mode = 'admins'; $visibility = 'shared'; $path = '/test/?view=one&view=two'; $calls = [];
$id = '11111111-1111-4111-8111-111111111111';
$c = ['project' => $id, 'credential_id' => '22222222-2222-4222-8222-222222222222', 'token' => 'fp_synthetic', 'site_url' => FeedbackPress\Service::home(), 'service' => 'https://service.example.test'];
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack($c));
add_filter('pre_option_feedbackpress_settings', function () use (&$mode) { return ['mode' => $mode]; });
add_filter('pre_http_request', function ($pre, $args, $url) use (&$calls, &$visibility, &$path, $id, $c) {
    $calls[] = $url;
    if (str_ends_with($url, '/issues/' . $id)) $data = ['id' => $id, 'path' => $path, 'visibility' => $visibility];
    elseif (str_ends_with($url, '/share-link')) $data = ['url' => 'https://review.example.com' . '/#fp-review=' . $c['credential_id'] . '.' . str_repeat('a', 43)];
    elseif (str_ends_with($url, '/invitations')) {
        $body = json_decode($args['body'], true);
        $actor = FeedbackPress\Service::unpack($args['headers']['X-FeedbackPress-Actor'] ?? '');
        if (array_keys($body) !== ['email', 'name', 'issued_at'] || $body['email'] !== ($GLOBALS['fp_invite_expected_email'] ?? 'reviewer@example.test') || $body['name'] !== ($GLOBALS['fp_invite_expected_name'] ?? 'reviewer') || !is_int($body['issued_at']) || $actor['email'] !== strtolower(wp_get_current_user()->user_email) || !FeedbackPress\Service::uuid($args['headers']['Idempotency-Key'] ?? '')) throw new RuntimeException('Invitation actor/key boundary failed');
        $data = ['kind' => 'invitation', 'captured' => true, 'sent' => false];
    } else throw new RuntimeException('Unexpected HTTP request');
    return ['headers' => [], 'response' => ['code' => 200, 'message' => 'OK'], 'body' => wp_json_encode($data)];
}, 10, 3);
$check = function ($value) { if (!$value) throw new RuntimeException('Ticket magic-link assertion failed'); };
$reviewers = new WP_REST_Request('GET', '/feedbackpress/v1/admin/reviewers');
$people = rest_do_request($reviewers); $check($people->get_status() === 200);
$native = array_values(array_filter($people->get_data()['users'], fn($user) => $user['id'] === $admin->ID));
$check(count($native) === 1 && $native[0]['email'] === $admin->user_email && $native[0]['name'] === $admin->display_name && count($calls) === 0);
$request = new WP_REST_Request('GET', '/feedbackpress/v1/issues/' . $id . '/review-link');
$response = rest_do_request($request); $check($response->get_status() === 200); $link = $response->get_data()['url'];
$check(str_starts_with($link, 'https://review.example.com' . $path . '#fp-review='));
parse_str(wp_parse_url($link, PHP_URL_FRAGMENT), $fragment); $check($fragment['fp-return'] === 'feedbackpress=' . $id);
$ability = wp_get_ability('feedbackpress/ticket-link'); $check($ability instanceof WP_Ability);
$check($ability->execute(['issue_id' => $id])['url'] === $link);
if (class_exists('WP\\MCP\\Abilities\\ExecuteAbilityAbility')) {
    $result = WP\MCP\Abilities\ExecuteAbilityAbility::execute(['ability_name' => 'feedbackpress/ticket-link', 'parameters' => ['issue_id' => $id]]); $check($result['success'] && $result['data']['url'] === $link);
}
$output = WP_CLI::runcommand('feedbackpress link ' . $id, ['return' => 'stdout', 'launch' => false]); $check(json_decode($output, true)['url'] === $link);
$invite = new WP_REST_Request('POST', '/feedbackpress/v1/admin/invite'); $invite->set_header('Idempotency-Key', wp_generate_uuid4()); $invite->set_param('email', 'reviewer@example.test'); $invite->set_param('issued_at', time()); $invite->set_param('project', $id); $invite->set_param('author_email', 'forged@example.test');
$sent = rest_do_request($invite); $check($sent->get_status() === 200 && $sent->get_data()['captured']);
$GLOBALS['fp_invite_expected_email'] = $admin->user_email; $GLOBALS['fp_invite_expected_name'] = $admin->display_name; $invite->set_param('user_id', $admin->ID); $invite->set_param('email', 'forged@example.test'); $invite->set_param('name', 'Forged name'); $check(rest_do_request($invite)->get_status() === 200); $invite->set_param('user_id', 99999999); $beforeUser = count($calls); $check(rest_do_request($invite)->get_status() === 400 && count($calls) === $beforeUser); $invite->set_param('user_id', 0);
$invite->set_param('project', '22222222-2222-4222-8222-222222222222'); $beforeInvite = count($calls); $check(rest_do_request($invite)->get_status() === 409 && count($calls) === $beforeInvite); $invite->set_param('project', $id);
$visibility = 'private'; $check(rest_do_request($request)->get_status() === 403 && is_wp_error($ability->execute(['issue_id' => $id]))); $visibility = 'shared';
$path = '//other.example.test/'; $check(rest_do_request($request)->get_status() === 409); $path = '/test/';
$before = count($calls); $mode = 'disabled'; $check(rest_do_request($request)->get_status() === 403 && rest_do_request($invite)->get_status() === 403 && count($calls) === $before);
$mode = 'everyone'; wp_set_current_user(0); $check(rest_do_request($reviewers)->get_status() === 403 && count($calls) === $before); $check(rest_do_request($invite)->get_status() === 403 && rest_do_request($request)->get_status() === 403 && is_wp_error($ability->execute(['issue_id' => $id])) && count($calls) === $before);
wp_set_current_user($admin->ID);
$guide = FeedbackPress\Agent::guidance(); $check(str_contains($guide['ticket_references'], 'chat with the user') && isset($guide['interfaces']['cli']['ticket_link']));
echo "PASS native REST/MCP/CLI direct ticket magic links, query/path preservation, fresh issue reads, private/disabled/guest denial agent chat guidance and administrator-only invitation actor/project/key boundaries. No actual HTTP, feedback or account changes.\n";
