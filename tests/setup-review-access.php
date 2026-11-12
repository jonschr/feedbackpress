<?php
defined('ABSPATH') || exit;
// New, independent local fixtures only. Secrets/receipts are written privately, never printed.
if (!current_user_can('manage_options') || !in_array(home_url(), ['https://feedbackpress-access-qa.localhost:8453', 'https://feedbackpress-access-other.localhost:8453'], true)) throw new RuntimeException('Isolated administrator fixture only.');
use FeedbackPress\Service;
use FeedbackPress\ReviewAccess;
$directory = getenv('FEEDBACKPRESS_ACCESS_OUTPUT'); $accountFile = getenv('FEEDBACKPRESS_ACCESS_ACCOUNT');
if (!$directory || !is_dir($directory) || str_starts_with(realpath($directory), ABSPATH)) throw new RuntimeException('Private output directory required.');
$file = $directory . '/' . wp_parse_url(home_url(), PHP_URL_HOST) . '-fixture.json';
if (file_exists($file) || Service::connection()) throw new RuntimeException('Refusing to overwrite an existing fixture/connection.');
$before = ['connection' => get_option(Service::OPTION, null), 'settings' => get_option('feedbackpress_settings', null), 'review_links' => get_option('feedbackpress_review_links', null)];
file_put_contents($file . '.before', wp_json_encode($before)); chmod($file . '.before', 0600);
$state = ['home' => home_url(), 'api' => rest_url('feedbackpress/v1/')];
$save = function () use (&$state, $file) { file_put_contents($file, wp_json_encode($state)); chmod($file, 0600); };
$account = json_decode(file_get_contents($accountFile), true);
Service::connectAccount('https://feedbackpress.elod.in', $account['token']);
$state['project'] = wp_generate_uuid4(); $save();
Service::manager('POST', '/projects', ['id' => $state['project'], 'name' => 'Review link acceptance ' . wp_parse_url(home_url(), PHP_URL_HOST)]);
Service::selectProject($state['project']);
update_option('feedbackpress_settings', ['mode' => 'admins'], false);
$user = wp_get_current_user(); $state['owner_email'] = $user->user_email;
$issue = Service::request('POST', '/issues', ['title' => 'Review link acceptance', 'body' => 'Shared feedback remains available through an authorized review link.', 'path' => '/?page_id=2&view=full', 'target' => ['selector' => '', 'x' => .5, 'y' => .5], 'author' => ['name' => $user->display_name, 'email' => $user->user_email]], wp_generate_uuid4());
$state['issue'] = $issue['id']; $state['private_marker'] = 'Private review link acceptance ' . wp_generate_uuid4(); $save();
Service::request('POST', '/issues/' . $issue['id'] . '/notes', ['body' => $state['private_marker'], 'agent' => 'Access regression'], wp_generate_uuid4(), true);
$state['link'] = ReviewAccess::link(); $parts = explode('#', $state['link']['url'], 2); $state['link']['url'] = $state['home'] . '/?page_id=2&view=full#' . $parts[1] . '&fp-return=' . rawurlencode('feedbackpress=' . $issue['id']); $save();
$password = WP_Application_Passwords::create_new_application_password($user->ID, ['name' => 'FeedbackPress isolated access acceptance']);
if (is_wp_error($password)) throw new RuntimeException('Could not create an isolated API test credential.');
$state['application_login'] = $user->user_login; $state['application_password'] = $password[0]; $state['application_id'] = $password[1]['uuid']; $save();
echo "Prepared isolated review project, one shared issue/private note, site-bound review link and private test API credential. No email/billing request.\n";
