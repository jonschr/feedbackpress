<?php
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON',true);
if (!in_array(home_url(),['https://feedbackpress-access-qa.localhost:8453','https://feedbackpress-access-other.localhost:8453'],true)) throw new RuntimeException('Isolated fixture only');
require_once dirname(__DIR__).'/feedbackpress.php';
use FeedbackPress\API;
use FeedbackPress\Identity;
add_filter('pre_http_request',function(){throw new RuntimeException('Unexpected network request');});
add_filter('pre_option_feedbackpress_settings',fn()=>['mode'=>'everyone']);
$owner=wp_get_current_user();$r=new WP_REST_Request('POST');$r->set_header('x-feedbackpress-expected-actor',Identity::id($owner->user_email));
if(API::write($r)!==true)throw new RuntimeException('Matching native owner rejected');
$changed=clone $owner;$changed->data=clone $owner->data;$changed->data->user_email='changed-precondition@example.test';$GLOBALS['current_user']=$changed;
$rejected=API::privateWrite($r);if(!is_wp_error($rejected)||$rejected->get_error_data()['status']!==409)throw new RuntimeException('Changed email did not reject stale private draft before forwarding');
wp_set_current_user(0);$rejected=API::privateWrite($r);if(!is_wp_error($rejected)||$rejected->get_error_data()['status']!==403)throw new RuntimeException('Expected actor header granted guest identity');
$GLOBALS['current_user']=$owner;
echo 'PASS Native WP identity precondition rejects stale email/private draft before HTTP, preserves matching owner, and cannot authenticate a guest. No saved user/options/feedback changes.';
