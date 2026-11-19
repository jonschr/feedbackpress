<?php
// Current source in native Cove QA. HTTP/mail are intercepted; temporary counters are removed.
defined('ABSPATH') || exit;
if (home_url() !== 'https://feedbackpress-qa-a.localhost:8453') throw new RuntimeException('Disposable QA only.');
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\{Service,ReviewAccess,Email_Verification,Identity,API,Log};
$admin=wp_get_current_user();$mode='admins';$id=wp_generate_uuid4();$person=['name'=>'Verified Reviewer','email'=>'verified-reviewer@example.test'];$calls=[];$mail=[];$used=false;$revoked=false;
$c=['project'=>'11111111-1111-4111-8111-111111111111','credential_id'=>'22222222-2222-4222-8222-222222222222','token'=>'fp_'.str_repeat('x',43),'site_url'=>Service::home(),'service'=>'https://service.example.test'];
$canonical=$c['credential_id'].'.'.str_repeat('a',43);
add_filter('pre_option_'.Service::OPTION,fn()=>Service::pack($c));add_filter('pre_option_feedbackpress_settings',function()use(&$mode){return ['mode'=>$mode];});add_filter('pre_update_option_'.Log::KEY,fn($value,$old)=>$old,10,2);
add_filter('pre_http_request',function($pre,$args,$url)use($c,$canonical,$person,$id,&$calls,&$mail,&$used,&$revoked){
 $calls[]=$url;$body=isset($args['body'])?json_decode($args['body'],true):null;$data=[];$status=200;
 if(str_ends_with($url,'/review-link')) {if($revoked)$status=403;else $data=['url'=>$c['site_url'].'/#fp-review='.$canonical];}
 elseif(str_ends_with($url,'/email-verification')) {if(isset($args['headers']['X-FeedbackPress-Actor'])||isset($args['headers']['X-FeedbackPress-Reviewer'])||$body['person']!==$person||$args['headers']['Idempotency-Key']!==$id)throw new RuntimeException('Wrong verification attribution');$mail[]=$body;$data=['pending'=>true];}
 elseif(str_ends_with($url,'/email-verification/consume')) {if($used)$status=403;else{$used=true;$data=['verified'=>true];}}
 else return new WP_Error('fixture_network_blocked','Unrelated HTTP blocked.');
 return ['headers'=>[],'response'=>['code'=>$status],'body'=>wp_json_encode($status===200?$data:['error'=>'verification_invalid'])];
},10,3);
$check=function($ok,$why='Email proof assertion failed'){if(!$ok)throw new RuntimeException($why);};$cookieKeys=[ReviewAccess::COOKIE,ReviewAccess::FLAG,Email_Verification::COOKIE];$before=array_intersect_key($_COOKIE,array_flip($cookieKeys));$remote=$_SERVER['REMOTE_ADDR']??null;$_SERVER['REMOTE_ADDR']='192.0.2.91';wp_set_current_user(0);$_COOKIE[ReviewAccess::COOKIE]=$canonical;
$origin=wp_parse_url(Service::home());$origin=$origin['scheme'].'://'.$origin['host'].(isset($origin['port'])?':'.$origin['port']:'');
$r=new WP_REST_Request('POST','/feedbackpress/v1/identity/verification');$r->set_header('Origin',$origin);$r->set_header('X-WP-Nonce',wp_create_nonce('wp_rest'));$r->set_header('Idempotency-Key',$id);$r->set_body_params(['author'=>$person['name'],'author_email'=>$person['email'],'path'=>'/review/?view=one&view=two','return'=>'feedbackpress='.$c['project']]);
try{
 $check(Email_Verification::current()===null);$write=new WP_REST_Request('POST');$write->set_header('Origin',$origin);$write->set_header('X-WP-Nonce',wp_create_nonce('wp_rest'));$write->set_header('X-FeedbackPress-Reviewer',Service::pack($person));$check(is_wp_error(API::write($write)),'Unverified first contribution admitted through browser reviewer header');
 $response=rest_do_request($r);$check($response->get_status()===200&&$response->get_data()['pending']);$check(!is_user_logged_in()&&Email_Verification::current()===null);$check(rest_do_request($r)->get_status()===200&&$mail[0]===$mail[1],'Retry changed the signed email');
 $params=[];parse_str(wp_parse_url($mail[0]['url'],PHP_URL_FRAGMENT),$params);$proof=$params['fp-verify'];$parts=explode('.',$proof);$payload=Service::unpack($parts[0]);$check($payload['expires']>time()&&$payload['expires']<=time()+900);$check(str_contains($mail[0]['url'],'/review/?view=one&view=two#'));
 $exchange=new WP_REST_Request('POST','/feedbackpress/v1/review-session');$exchange->set_header('Origin',$origin);$exchange->set_body_params(['token'=>$canonical,'verification'=>$proof.'tampered']);$check(rest_do_request($exchange)->get_status()===403&&!$used,'Tampered verification accepted');
 $expired=$payload;$expired['expires']=time()-1;$encoded=Service::pack($expired);$expired=$encoded.'.'.rtrim(strtr(base64_encode(hash_hmac('sha256',"verify-email\n".$encoded,wp_salt('auth'),true)),'+/','-_'),'=');$exchange->set_param('verification',$expired);$check(rest_do_request($exchange)->get_status()===403&&!$used,'Expired verification accepted');
 $exchange->set_param('verification',$proof);$response=rest_do_request($exchange);$check($response->get_status()===200&&$used,'Verification exchange failed');$verified=Email_Verification::current();$check($verified['email']===$person['email']&&!is_user_logged_in());$check($response->get_data()['config']['privateNotes']===false&&$response->get_data()['config']['verifiedReviewer']['email']===$person['email']);
 $long=Service::unpack(explode('.',$_COOKIE[Email_Verification::COOKIE])[0]);$check(abs($long['expires']-time()-180*DAY_IN_SECONDS)<10);$check(API::write($write)===true,'Verified contribution denied');$claim=new WP_REST_Request('POST');$claim->set_body_params(['author'=>'Forged','author_email'=>'other@example.test']);$check(Identity::request($claim)=== $person,'Browser input replaced verified identity');$check(is_wp_error(API::privateRead()),'Verified guest gained private access');
 $check(rest_do_request($exchange)->get_status()===403,'Email proof replay accepted');
 wp_set_current_user($admin->ID);Email_Verification::accept('expired-or-used-proof',$canonical);$check(Identity::request($claim)['email']===strtolower($admin->user_email)&&Email_Verification::current()===null,'Native login did not win');wp_set_current_user(0);
 $reflection=new ReflectionProperty(ReviewAccess::class,'checked');$reflection->setValue(null,[]);$revoked=true;$check(Email_Verification::current()===null&&!API::can_view(),'Revocation left verified guest access');
}finally{
 wp_set_current_user($admin->ID);foreach($cookieKeys as $key)unset($_COOKIE[$key]);$_COOKIE+=$before;$_SERVER['REMOTE_ADDR']=$remote;delete_transient('fp_email_issued_'.$id);delete_transient('fp_link_rate_'.hash_hmac('sha256','192.0.2.91',wp_salt()));foreach([intdiv(time(),60),intdiv(time(),60)-1] as $minute)delete_transient('fp_changes_'.hash_hmac('sha256',$c['project'].':ip:192.0.2.91:'.$minute,wp_salt()));
}
echo "PASS first-contribution gate, stable verification retry, native signed proof/tamper/expiry/single-use checks, 180-day remembered email, immutable guest attribution, native-login precedence, private isolation and revocation; HTTP intercepted and counters removed.\n";
