<?php
// Native disposable Cove QA users only; all service HTTP and mail are intercepted.
defined('ABSPATH') || exit;
if (home_url() !== 'https://feedbackpress-qa-a.localhost:8453') throw new RuntimeException('Disposable QA site only.');
require_once dirname(__DIR__) . '/feedbackpress.php';
require_once ABSPATH . 'wp-admin/includes/user.php';
$admin = wp_get_current_user(); $created = []; $existingRole = get_role('feedbackpress_reviewer'); $allowed = true; $recipient = null; $mail = 0; $createAccount = true;
$c = ['project' => '11111111-1111-4111-8111-111111111111', 'credential_id' => '22222222-2222-4222-8222-222222222222', 'token' => 'fp_fixture', 'service' => 'https://service.example.test', 'site_url' => FeedbackPress\Service::home()];
add_filter('pre_option_' . FeedbackPress\Service::OPTION, fn() => FeedbackPress\Service::pack($c));
add_filter('pre_option_feedbackpress_settings', fn() => ['mode' => 'admins']);
add_filter('pre_wp_mail', function()use(&$mail){$mail++;return true;});
add_filter('pre_http_request', function($pre,$args,$url)use(&$recipient,&$allowed,&$createAccount,$c){
 if (!str_ends_with($url,'/invitations/recipient') || $args['headers']['Authorization'] !== 'Bearer '.$c['token'] || $args['headers']['X-FeedbackPress-Site'] !== $c['site_url'] || isset($args['headers']['X-FeedbackPress-Actor'])) throw new RuntimeException('Wrong invitation gateway');
 return ['headers'=>[],'response'=>['code'=>$allowed?200:403],'body'=>wp_json_encode($allowed?['recipient'=>$recipient,'create_account'=>$createAccount]:['error'=>'invalid_review_link'])];
},10,3);
$check = function($ok){if(!$ok)throw new RuntimeException('Invitation account assertion failed');};
$unique = strtolower(wp_generate_password(10,false)); $email='fp-'.$unique.'@example.invalid';
try {
 wp_set_current_user(0);$before=count(get_users());FeedbackPress\ReviewAccess::inviteAccount('synthetic-proof');$check(count(get_users())===$before);
 $recipient=['email'=>$email,'name'=>'New reviewer'];FeedbackPress\ReviewAccess::inviteAccount('synthetic-proof');$user=get_user_by('email',$email);$check((bool)$user);$created[]=$user->ID;
 $check($user->roles===['feedbackpress_reviewer'] && !user_can($user,'read') && !user_can($user,'edit_posts') && !user_can($user,'upload_files') && !user_can($user,'manage_options') && user_can($user,'feedbackpress_review'));
 $check(!is_user_logged_in() && !FeedbackPress\ReviewAccess::member());$check(get_user_meta($user->ID,'feedbackpress_projects',true)===[$c['project']]);
 FeedbackPress\ReviewAccess::inviteAccount('synthetic-proof');$check(count(get_users())===$before+1);
 wp_set_current_user($user->ID);$check(FeedbackPress\API::can_view());$check(FeedbackPress\ReviewAccess::member());$check(FeedbackPress\API::write(new WP_REST_Request('POST'))===true);
 $actor=FeedbackPress\Identity::request(new WP_REST_Request('POST'));$check($actor['email']===$email && FeedbackPress\Identity::id($actor['email'])===FeedbackPress\Identity::id($email));
 $other=$c;$other['project']='33333333-3333-4333-8333-333333333333';$check(!FeedbackPress\ReviewAccess::member($other));
 wp_set_current_user(0);$id=wp_insert_user(['user_login'=>'fp_existing_'.$unique,'user_email'=>'existing-'.$unique.'@example.invalid','user_pass'=>'fixture-password','role'=>'editor']);$check(!is_wp_error($id));$created[]=$id;$existing=get_userdata($id);$roles=$existing->roles;$hash=$existing->user_pass;
 $createAccount=false;$recipient=['email'=>$existing->user_email,'name'=>'Invited name'];FeedbackPress\ReviewAccess::inviteAccount('synthetic-proof');$same=get_userdata($id);$check($same->roles===$roles && $same->user_pass===$hash && $same->display_name===$existing->display_name);$check(get_user_meta($id,'feedbackpress_projects',true)===[$c['project']]);
 $recipient=['email'=>'blocked-'.$unique.'@example.invalid','name'=>'Blocked'];$allowed=false;try{FeedbackPress\ReviewAccess::inviteAccount('tampered-proof');throw new RuntimeException('Invalid proof accepted');}catch(FeedbackPress\RemoteError $error){$check($error->getCode()===403);}$check(!get_user_by('email',$recipient['email']));$check($mail===0);
} finally {
 wp_set_current_user($admin->ID);foreach($created as $id){wp_delete_user($id);foreach([intdiv(time(),60),intdiv(time(),60)-1] as $minute)delete_transient('fp_changes_'.hash_hmac('sha256',$c['project'].':user:'.$id.':'.$minute,wp_salt()));}if(!$existingRole)remove_role('feedbackpress_reviewer');
}
foreach($created as $id)$check(!get_userdata($id));if(!$existingRole)$check(!get_role('feedbackpress_reviewer'));
echo "PASS opt-out, zero-site-capability reviewer, existing account reuse, duplicate invite, no auto-login, project membership, stable email attribution and invalid-proof denial; temporary users/role removed, HTTP/mail intercepted.\n";
