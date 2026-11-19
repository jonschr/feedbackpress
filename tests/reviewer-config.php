<?php
// Native WordPress bootstrap, synthetic review grant and intercepted HTTP. No writes.
defined('ABSPATH') || exit;
require_once dirname(__DIR__) . '/feedbackpress.php';
$httpRequests = 0;
$mode = 'admins';add_filter('pre_option_feedbackpress_settings', function()use(&$mode){return ['mode'=>$mode];});
$connection = ['project' => '11111111-1111-4111-8111-111111111111', 'credential_id' => '22222222-2222-4222-8222-222222222222', 'token' => 'fp_' . str_repeat('x', 43), 'site_url' => FeedbackPress\Service::home(), 'service' => 'https://service.example.test'];
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack($connection));
$message = implode("\n", ['feedbackpress-review-v1', $connection['project'], $connection['site_url'], $connection['credential_id']]);
$_COOKIE[FeedbackPress\ReviewAccess::COOKIE] = $connection['credential_id'] . '.' . rtrim(strtr(base64_encode(hash_hmac('sha256', $message, hash('sha256', $connection['token']), true)), '+/', '-_'), '=');
add_filter('pre_http_request', function($pre,$args,$url)use(&$httpRequests,$connection){$httpRequests++;if($args['method']!=='POST'||!str_ends_with($url,'/review-link'))return new WP_Error('fixture_network_blocked','Unrelated HTTP blocked.');return ['headers'=>[],'response'=>['code'=>200],'body'=>wp_json_encode(['url'=>FeedbackPress\Service::home().'/#fp-review='.$_COOKIE[FeedbackPress\ReviewAccess::COOKIE]])];},10,3);
$assert = function ($value) { if (!$value) throw new RuntimeException('Reviewer configuration assertion failed at line '.debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS,1)[0]['line']); };
$admin = wp_get_current_user();
$assert(current_user_can('manage_options'));
// A review cookie may disable page caching, but rendering must never call the service.
wp_set_current_user(0);
foreach($GLOBALS['wp_filter']['template_redirect']->callbacks as $callbacks)foreach($callbacks as $callback){$function=$callback['function'];if($function instanceof Closure&&(new ReflectionFunction($function))->getFileName()===dirname(__DIR__).'/feedbackpress.php')$function();}
$assert($httpRequests === 0 && defined('DONOTCACHEPAGE') && DONOTCACHEPAGE);
wp_set_current_user($admin->ID);

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
$assert($httpRequests === 1);
// Public HTML must never embed verified attribution or an inline review config.
$mode='everyone';unset($_COOKIE[FeedbackPress\ReviewAccess::COOKIE]);
foreach($GLOBALS['wp_filter']['wp_enqueue_scripts']->callbacks as $callbacks)foreach($callbacks as $callback){$function=$callback['function'];if($function instanceof Closure&&(new ReflectionFunction($function))->getFileName()===dirname(__DIR__).'/feedbackpress.php')$function();}
$data=wp_scripts()->get_data('feedbackpress-access','data');$assert(str_contains($data,'"publicReview":"1"')&&!str_contains($data,'verifiedReviewer')&&!wp_script_is('feedbackpress','enqueued'));
$r=new WP_REST_Request('GET','/feedbackpress/v1/review-session');$response=rest_do_request($r);$assert($response->get_status()===200&&$response->get_data()['config']['verifiedReviewer']===null&&!$response->get_data()['config']['privateNotes']);
$GLOBALS['current_user'] = $admin;
echo "PASS native login wins over review grant/guest attribution, admin-only sharing, filtered login URL guest/private separation and uncached public-mode bootstrap without inline identity. No writes; validation HTTP intercepted.\n";
