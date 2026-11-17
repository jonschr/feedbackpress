<?php
// Native WordPress bootstrap, synthetic review grant and intercepted HTTP. No writes.
defined('ABSPATH') || exit;
require_once dirname(__DIR__) . '/feedbackpress.php';
$httpRequests = 0;
add_filter('pre_http_request', function () use (&$httpRequests) { $httpRequests++; return new WP_Error('test_http_blocked', 'Test HTTP blocked'); });
add_filter('pre_option_feedbackpress_settings', fn() => ['mode' => 'admins']);
$connection = ['project' => '11111111-1111-4111-8111-111111111111', 'credential_id' => '22222222-2222-4222-8222-222222222222', 'token' => 'fp_' . str_repeat('x', 43), 'site_url' => FeedbackPress\Service::home()];
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack($connection));
$message = implode("\n", ['feedbackpress-review-v1', $connection['project'], $connection['site_url'], $connection['credential_id']]);
$_COOKIE[FeedbackPress\ReviewAccess::COOKIE] = $connection['credential_id'] . '.' . rtrim(strtr(base64_encode(hash_hmac('sha256', $message, hash('sha256', $connection['token']), true)), '+/', '-_'), '=');
$assert = function ($value) { if (!$value) throw new RuntimeException('Reviewer configuration assertion failed'); };
$admin = wp_get_current_user();
$assert(current_user_can('manage_options'));
$config = FeedbackPress\frontend_config();
$assert($config['reviewSession'] && $config['privateNotes'] && $config['canShareReviewLinks']);
$assert($config['userName'] === $admin->display_name && $config['authorId'] === FeedbackPress\Identity::id($admin->user_email));
$request = new WP_REST_Request('POST'); $request->set_param('author', 'Forged guest'); $request->set_param('author_email', 'guest@example.test');
$actor = FeedbackPress\Identity::request($request);
$assert($actor['name'] === $admin->display_name && $actor['email'] === strtolower(trim($admin->user_email)));
add_filter('login_url', fn() => home_url('/team-login/'));
$assert(FeedbackPress\frontend_config()['loginUrl'] === home_url('/team-login/'));
$reader = new WP_User(); $reader->ID = PHP_INT_MAX; $reader->data = (object) ['display_name' => 'Native reader', 'user_email' => 'reader@example.test']; $reader->allcaps = ['read' => true]; $GLOBALS['current_user'] = $reader;
$config = FeedbackPress\frontend_config();
$assert($config['reviewSession'] && !$config['canShareReviewLinks'] && $config['userName'] === 'Native reader');
try { FeedbackPress\ReviewAccess::link(); throw new RuntimeException('Non-administrator retrieved a review link'); }
catch (RuntimeException $error) { $assert($error->getCode() === 403); }
wp_set_current_user(0);
$config = FeedbackPress\frontend_config();
$assert($config['reviewSession'] && !$config['privateNotes'] && !$config['canShareReviewLinks'] && $config['userName'] === '' && $config['authorId'] === '');
$assert($httpRequests === 0);
$GLOBALS['current_user'] = $admin;
echo "PASS native login wins over review grant/guest attribution, admin-only sharing, filtered login URL and guest/private separation. No writes or HTTP.\n";
