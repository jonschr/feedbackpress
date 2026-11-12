<?php
// Isolated local acceptance only. All credentials/session material stays outside the web root.
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON',true);
if (!current_user_can('manage_options') || !in_array(home_url(),['https://feedbackpress-access-qa.localhost:8453','https://feedbackpress-access-other.localhost:8453'],true)) throw new RuntimeException('Isolated administrator fixture only.');
add_filter('pre_wp_mail',fn()=>true);
use FeedbackPress\Service;
$out=getenv('FEEDBACKPRESS_NOTE_OUTPUT');
if (!$out || !is_dir($out) || !str_starts_with(realpath($out),'/Users/jonschroeder/Library/Application Support/FeedbackPress/private/')) throw new RuntimeException('Private output required.');
$file=$out.'/'.wp_parse_url(home_url(),PHP_URL_HOST).'-note-fixture.json';if(file_exists($file))throw new RuntimeException('Refusing to overwrite fixture.');
$before=['connection'=>get_option(Service::OPTION),'settings'=>get_option('feedbackpress_settings'),'review_links'=>get_option('feedbackpress_review_links')];
file_put_contents($file.'.before',wp_json_encode($before));chmod($file.'.before',0600);
$projectFile=$out.'/installed-project.json';$account=Service::manager('GET','/account');
if(file_exists($projectFile)){$project=json_decode(file_get_contents($projectFile),true);if($project['account']!==$account['id'])throw new RuntimeException('Fixture accounts differ.');}
else{$project=['id'=>wp_generate_uuid4(),'account'=>$account['id'],'run'=>substr(str_replace('-','',wp_generate_uuid4()),0,10)];file_put_contents($projectFile,wp_json_encode($project));chmod($projectFile,0600);Service::manager('POST','/projects',['id'=>$project['id'],'name'=>'Note lifecycle acceptance '.$project['run']]);}
Service::selectProject($project['id']);update_option('feedbackpress_settings',['mode'=>'everyone'],false);
$state=['home'=>home_url(),'api'=>rest_url('feedbackpress/v1/'),'project'=>$project['id'],'run'=>$project['run'],'actors'=>[]];
$save=function()use(&$state,$file){file_put_contents($file,wp_json_encode($state));chmod($file,0600);};$save();
foreach(['owner'=>'administrator','other'=>'subscriber'] as $kind=>$role){
 $login='fpnotes'.$kind.$project['run'];if(username_exists($login))throw new RuntimeException('Refusing to reuse a test user.');
 $email=$login.'@example.test';$id=wp_insert_user(['user_login'=>$login,'user_pass'=>wp_generate_password(40,true,true),'user_email'=>$email,'display_name'=>$kind==='owner'?'Note owner':'Other reviewer','role'=>$role]);
 if(is_wp_error($id)||$id<=1)throw new RuntimeException('Test actor creation failed.');
 $expiry=time()+7200;$token=WP_Session_Tokens::get_instance($id)->create($expiry);
 $cookies=[];foreach([LOGGED_IN_COOKIE=>'logged_in',SECURE_AUTH_COOKIE=>'secure_auth'] as $name=>$scheme)$cookies[]=['name'=>$name,'value'=>wp_generate_auth_cookie($id,$expiry,$scheme,$token),'domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'path'=>'/','secure'=>true,'httpOnly'=>true,'sameSite'=>'Lax','expires'=>$expiry];
 $state['actors'][$kind]=['id'=>$id,'login'=>$login,'email'=>$email,'token'=>$token,'cookies'=>$cookies];$save();
}
echo 'Prepared fresh isolated note project, backed-up plugin options and native temporary WP sessions. No notification delivery or feedback reset.';
