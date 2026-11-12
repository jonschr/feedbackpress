<?php
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON',true);
if (!in_array(home_url(),['https://feedbackpress-access-qa.localhost:8453','https://feedbackpress-access-other.localhost:8453'],true)) throw new RuntimeException('Isolated fixture only');
define('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE',true);
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\Service;
use FeedbackPress\Identity;
use FeedbackPress\API;
$sites=json_decode(file_get_contents(getenv('FEEDBACKPRESS_REVIEW_FIXTURE')),true);$site=substr(wp_parse_url(home_url(),PHP_URL_HOST),0,-10);$entry=$sites[$site];
$c=['project'=>$entry['project'],'token'=>$entry['token'],'credential_id'=>$entry['credential_id'],'site_url'=>$entry['url'],'service'=>'http://127.0.0.1:8791'];
add_filter('pre_option_'.Service::OPTION,fn()=>Service::pack($c));add_filter('pre_option_feedbackpress_settings',fn()=>['mode'=>'everyone']);
add_filter('pre_http_request',function($pre,$args,$url){if(!str_starts_with($url,'http://127.0.0.1:8791/v1/'))throw new RuntimeException('External fixture HTTP forbidden');if(is_user_logged_in()){if(($args['headers']['X-FeedbackPress-View']??'')!=='owner')throw new RuntimeException('Missing owner view');$actor=Service::unpack($args['headers']['X-FeedbackPress-Actor']??'');if(($actor['email']??'')!==strtolower(trim(wp_get_current_user()->user_email)))throw new RuntimeException('Untrusted actor');}return $pre;},10,3);
$assert=function($v,$message){if(!$v)throw new RuntimeException($message);};$denied=function($work,$code)use($assert){try{$work();}catch(Throwable $e){$assert($e->getCode()===$code,'Wrong rejection');return;}throw new RuntimeException('Expected rejection');};
$owner=wp_get_current_user();$request=new WP_REST_Request('POST');$request->set_body_params(['author'=>'Forged','author_email'=>'forged@example.test','actor'=>['email'=>'forged@example.test']]);$who=Identity::request($request);$assert($who['email']===$owner->user_email,'Browser attribution override trusted');
$i=Service::request('POST','/issues',['title'=>'Disposable owner controls','body'=>'Original body','author'=>$who,'path'=>'/?page_id=2&view=full','target'=>['selector'=>'','x'=>.5,'y'=>.5]],wp_generate_uuid4());$id=$i['id'];$path='/issues/'.$id;
$i=Service::request('POST',$path.'/replies',['revision'=>$i['revision'],'body'=>'PRIVATE REPLY SENTINEL','author'=>$who],wp_generate_uuid4());$reply=end($i['comments'])['id'];
$i=Service::request('POST',$path.'/comments/'.$reply.'/manage',['revision'=>$i['revision'],'action'=>'private'],wp_generate_uuid4(),true);$view=Service::view($i);$assert($view['activity'][0]['payload']['visibility']==='private','Private reply projection lost');
// Resolve a changed authenticated WP email on this request without changing the saved user record.
$other=clone $owner;$other->data=clone $owner->data;$other->data->user_email='different-owner@example.test';$GLOBALS['current_user']=$other;
$stale=new WP_REST_Request('POST');$stale->set_header('x-feedbackpress-expected-actor',Identity::id($owner->user_email));$rejected=API::write($stale);$assert(is_wp_error($rejected)&&$rejected->get_error_data()['status']===409,'Stale browser identity was not rejected before a write');
$assert(!str_contains(wp_json_encode(Service::request('GET',$path)),'PRIVATE REPLY SENTINEL'),'Other WP actor read private reply');$denied(fn()=>Service::request('POST',$path.'/comments/'.$reply.'/manage',['revision'=>$i['revision'],'action'=>'delete'],wp_generate_uuid4(),true),404);
wp_set_current_user(0);$assert(!str_contains(wp_json_encode(Service::request('GET',$path)),'PRIVATE REPLY SENTINEL'),'Guest read private reply');$assert(is_wp_error(API::privateRead()),'Guest private route admitted');
$GLOBALS['current_user']=$owner;$i=Service::request('GET',$path);$i=Service::request('POST',$path.'/manage',['revision'=>$i['revision'],'action'=>'private'],wp_generate_uuid4(),true);$assert(Service::view($i)['visibility']==='private','Private issue projection lost');
wp_set_current_user(0);$denied(fn()=>Service::request('GET',$path),404);$assert(!array_filter(Service::snapshot()['issues'],fn($item)=>$item['id']===$id),'Private issue entered guest snapshot');
$GLOBALS['current_user']=$other;$denied(fn()=>Service::request('GET',$path),404);
$GLOBALS['current_user']=$owner;$assert((bool)array_filter(Service::snapshot()['issues'],fn($item)=>$item['id']===$id),'Owner private issue absent');
$n=Service::request('POST',$path.'/notes',['kind'=>'human','body'=>'Private human note'],wp_generate_uuid4(),true);$n=Service::request('PATCH',$path.'/notes/'.$n['id'],['revision'=>$n['revision'],'body'=>'Private human edited'],wp_generate_uuid4(),true);$assert($n['body']==='Private human edited','Private edit failed');
$denied(fn()=>Service::request('POST',$path.'/notes/'.$n['id'].'/convert',['revision'=>$n['revision'],'publish'=>true],wp_generate_uuid4(),true),409);
$i=Service::request('GET',$path);$i=Service::request('POST',$path.'/manage',['revision'=>$i['revision'],'action'=>'public'],wp_generate_uuid4(),true);
$published=Service::request('POST',$path.'/notes/'.$n['id'].'/convert',['revision'=>$n['revision'],'publish'=>true],wp_generate_uuid4(),true);$assert($published['visibility']==='shared','Human publication failed');$i=$published['issue'];
wp_set_current_user(0);$assert(str_contains(wp_json_encode(Service::request('GET',$path)),'Private human edited'),'Published human reply absent');$assert(!str_contains(wp_json_encode(Service::request('GET',$path)),'PRIVATE REPLY SENTINEL'),'Publishing issue published private reply');
$GLOBALS['current_user']=$owner;$deleted=Service::request('POST',$path.'/manage',['revision'=>$i['revision'],'action'=>'delete'],wp_generate_uuid4(),true);$assert($deleted['deleted'],'Whole issue deletion failed');$denied(fn()=>Service::request('GET',$path),404);
$export=dirname(getenv('FEEDBACKPRESS_REVIEW_FIXTURE')).'/owner-private-export.json';
if(file_exists($export)){
 $first=json_decode(file_get_contents($export),true);
 if($first['email']===strtolower(trim($owner->user_email))){$shared=Service::request('GET','/issues/'.$first['id']);$assert($shared['visibility']==='private','Same owner did not see cross-copy private issue');}
 else $denied(fn()=>Service::request('GET','/issues/'.$first['id']),404);
}else{
 $shared=Service::request('POST','/issues',['title'=>'Cross-copy private issue','body'=>'Matching WP email only','author'=>$who,'path'=>'/','target'=>['selector'=>'','x'=>.5,'y'=>.5]],wp_generate_uuid4());
 $shared=Service::request('POST','/issues/'.$shared['id'].'/manage',['revision'=>$shared['revision'],'action'=>'private'],wp_generate_uuid4(),true);
 file_put_contents($export,wp_json_encode(['id'=>$shared['id'],'email'=>strtolower(trim($owner->user_email))]));chmod($export,0600);
}
echo 'PASS Feedback gateway: native WP actor, guest/changed-email separation, private owner replies/issues, private editing, explicit human publication, protected private child and soft deletion. No saved settings/users/feedback or provider calls.';
