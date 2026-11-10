<?php
// Standalone identity/reduction checks, no customer data or WordPress bootstrap.
define('ABSPATH', __DIR__); define('ARRAY_A', 'ARRAY_A');
$users = [(object)['display_name' => 'Local Nice Name', 'user_email' => 'client@example.test']];
function get_users($args) { return $GLOBALS['users']; }
function is_user_logged_in() { return false; }
function sanitize_text_field($s) { return trim(strip_tags($s)); }
function sanitize_textarea_field($s) { return trim(strip_tags($s)); }
function is_email($s) { return filter_var($s, FILTER_VALIDATE_EMAIL); }
class WP_REST_Request { function __construct(private array $p) {} function get_param($k) { return $this->p[$k] ?? null; } }
require dirname(__DIR__).'/includes/store.php'; require dirname(__DIR__).'/includes/identity.php'; require dirname(__DIR__).'/includes/api.php'; require dirname(__DIR__).'/includes/sync.php';
use FeedbackPress\{Identity, Store, Sync};
function check($ok, $why) { if (!$ok) throw new RuntimeException($why); echo "PASS $why\n"; }
$id='11111111-1111-4111-8111-111111111111';$other='22222222-2222-4222-8222-222222222222';
$p=Identity::request(new WP_REST_Request(['author'=>'Client','author_email'=>'CLIENT@example.test']));
check($p['author_id']===Identity::id('client@example.test') && !isset($p['email']), 'Normalized email identifies authors without storing email in feedback');
check(Identity::name($p)==='Local Nice Name', 'Current-site WordPress display name overrides captured name');
$GLOBALS['users']=[];check(Identity::name($p)==='Client', 'Other sites retain captured name when no WordPress account matches');
try { Identity::request(new WP_REST_Request(['author'=>'Anonymous']));check(false,'Missing email rejected'); } catch(InvalidArgumentException $e) { check(true,'Guest comments require email as well as name'); }
$root=['id'=>$id,'issue_id'=>$id,'kind'=>'issue','payload'=>$p+['number'=>'1','body'=>'Original','path'=>'/','context'=>[],'target'=>['selector'=>'','text'=>'','x'=>.5,'y'=>.5]],'environment'=>'local','created_at'=>'2026-11-10T12:00:00Z'];
$assignment=['id'=>$other,'issue_id'=>$id,'kind'=>'author','payload'=>['author'=>'Reviewer','author_id'=>Identity::id('reviewer@example.test'),'parents'=>[$id]],'environment'=>'remote','created_at'=>'2026-11-10T12:01:00Z'];
check(Sync::validate($assignment), 'Author reassignment is a valid sync event');
$i=Store::reduce([$assignment,$root]);check($i['author']==='Reviewer' && $i['author_heads']===[$other], 'Out-of-order sync preserves author changes using causal parents');
check(Store::reduce([$root,$assignment])['author_revision']===$i['author_revision'], 'Author revision is independent of arrival order');
$bad=$assignment;$bad['payload']['author_id']='not-an-id';check(!Sync::validate($bad),'Sync rejects invalid author identifiers');
check(!str_contains(json_encode($i),'@example.test'), 'Issue response contains no raw email');

$concurrent=$assignment;$concurrent['id']='33333333-3333-4333-8333-333333333333';$concurrent['payload']['author']='Other Reviewer';
$conflict=Store::reduce([$root,$assignment,$concurrent]);check($conflict['author_conflict'] && count($conflict['author_heads'])===2,'Concurrent author changes stay detectable across environments');
$resolved=$assignment;$resolved['id']='44444444-4444-4444-8444-444444444444';$resolved['payload']['parents']=$conflict['author_heads'];$resolved['created_at']='2000-01-01T00:00:00Z';
check(!Store::reduce([$resolved,$root,$assignment,$concurrent])['author_conflict'],'Choosing an author resolves concurrent changes without trusting clocks');
$move=['id'=>'55555555-5555-4555-8555-555555555555','issue_id'=>$id,'kind'=>'target','payload'=>['author'=>'Reviewer','target'=>['selector'=>'#new-element','text'=>'New location','x'=>.25,'y'=>.75],'parents'=>[$id]],'environment'=>'remote','created_at'=>'2026-11-10T12:02:00Z'];
check(Sync::validate($move),'Pin moves travel as validated sync events');
$moved=Store::reduce([$move,$root]);check($moved['target']['selector']==='#new-element'&&$moved['number']==='1'&&$moved['status']==='todo','Moving a pin preserves its number and status through out-of-order delivery');
check(Store::reduce([$root,$move])['target_revision']===$moved['target_revision'],'Pin revisions are independent of event arrival order');
$invalid=$move;$invalid['payload']['target']['x']=1.5;check(!Sync::validate($invalid),'Sync rejects positions outside the selected element');

$unicode=$move;$unicode['payload']['target']['text']=str_repeat('é',240);check(Sync::validate($unicode),'Moved element context supports multibyte text without losing the pin');
$titled=$root;$titled['payload']['title']='Short summary';$titled['payload']['body']='The longer description stays separate.';
check(Store::reduce([$titled])['title']==='Short summary' && Store::reduce([$titled])['body']==='The longer description stays separate.','Issue titles and descriptions stay separate');
check(Store::reduce([$root])['title']==='Original' && Store::reduce([$root])['title_generated'],'Old notes get a display title without changing their description');
check(Sync::validate($titled),'Titles travel in issue sync payloads');
$titled['payload']['title']=str_repeat('x',121);check(!Sync::validate($titled),'Sync rejects titles exceeding 120 characters');

foreach (['todo','doing','review','done'] as $status) { $initial=$root;$initial['payload']['status']=$status;$issue=Store::reduce([$initial]);check($issue['status']===$status && Sync::validate($initial),'Initial '.$status.' status survives storage and sync'); }
$invalid=$root;$invalid['payload']['status']='unknown';check(!Sync::validate($invalid),'Invalid initial statuses are rejected by sync');
$edit=['id'=>'66666666-6666-4666-8666-666666666666','issue_id'=>$id,'kind'=>'edit','payload'=>['author'=>'Client','author_id'=>$p['author_id'],'comment_id'=>$id,'title'=>'Edited title','body'=>'Edited description','parents'=>[$id]],'environment'=>'remote','created_at'=>'2026-11-10T13:00:00Z'];
$changed=Store::reduce([$edit,$root]);check($changed['body']==='Edited description'&&$changed['title']==='Edited title'&&$changed['number']==='1','Comment edits preserve issue identity and apply out of order');
check(Sync::validate($edit)&&$changed['edited_at']===$edit['created_at'],'Edits synchronize with an edited timestamp');
$competing=$edit;$competing['id']='77777777-7777-4777-8777-777777777777';$competing['payload']['body']='Competing description';check(Store::reduce([$root,$edit,$competing])['edit_conflict'],'Concurrent edits are preserved as a conflict');
$reply=['id'=>'88888888-8888-4888-8888-888888888888','issue_id'=>$id,'kind'=>'reply','payload'=>$p+['body'=>'Original reply'],'created_at'=>'2026-11-10T12:10:00Z','environment'=>'local'];$replyEdit=$edit;$replyEdit['id']='99999999-9999-4999-8999-999999999999';$replyEdit['payload']['comment_id']=$reply['id'];$replyEdit['payload']['parents']=[$reply['id']];unset($replyEdit['payload']['title']);$replyEdit['payload']['body']='Edited reply';$changed=Store::reduce([$replyEdit,$reply,$root]);check($changed['activity'][0]['payload']['body']==='Edited reply'&&$changed['body']==='Original','Reply edits keep their comment ID and leave the issue description unchanged');

$resolvedEdit=$edit;$resolvedEdit['id']='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';$resolvedEdit['payload']['parents']=Store::reduce([$root,$edit,$competing])['edit_heads'];check(!Store::reduce([$resolvedEdit,$competing,$root,$edit])['edit_conflict'],'Saving against both revision heads resolves competing comment edits');

$media=['id'=>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','issue_id'=>$id,'kind'=>'file','payload'=>['name'=>'note.pdf','comment_id'=>$reply['id'],'expires_at'=>1,'screenshot'=>false],'environment'=>'local','created_at'=>'2026-11-10T12:15:00Z'];$withMedia=Store::reduce([$root,$reply,$media,$replyEdit]);check($withMedia['files'][0]['comment_id']===$reply['id']&&count($withMedia['activity'])===1,'Editing preserves attachment association and does not duplicate replies');

$number=$edit;$number['kind']='number';$number['payload']=['number'=>'2'];$number['created_at']='2099-01-01T00:00:00Z';
$higher=$number;$higher['id']='cccccccc-cccc-4ccc-8ccc-cccccccccccc';$higher['payload']['number']='3';$higher['created_at']='2000-01-01T00:00:00Z';
check(Store::reduce([$higher,$root,$number])['number']==='3'&&Store::reduce([$number,$root,$higher])['number']==='3','Numeric corrections converge regardless of arrival order or clock skew');
check(Store::reduce([$root,$higher])['updated_at']===Store::reduce([$root])['updated_at']&&Store::reduce([$root,$higher])['revision']===Store::reduce([$root])['revision'],'Number corrections do not change edit dates or status revisions');
check(Sync::validate($higher),'Numeric correction events synchronize normally');$number['payload']['number']='AB12CD34-1';check(!Sync::validate($number),'New number corrections cannot reintroduce environment codes');
