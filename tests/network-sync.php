<?php
namespace FeedbackPress {
    const VERSION = 'test';
    function defaults(): array { return ['mode' => 'everyone', 'retention' => 90, 'secret' => str_repeat('a', 64)]; }
    function settings(): array { return get_option('feedbackpress_settings', []) + ['project' => Network::data()['id'] ?? '', 'environment' => Network::self()['type'] ?? 'local'] + defaults(); }
    function bound(): bool { return Network::self() !== null; }
}
namespace {
// Standalone integration check: PHP with PDO SQLite. No WordPress installation or external requests.
if (PHP_SAPI !== 'cli') exit;
$root = sys_get_temp_dir() . '/feedbackpress-network-' . bin2hex(random_bytes(6));
mkdir($root); define('ABSPATH', $root . '/current/public/'); define('DB_NAME', 'isolated'); define('ARRAY_A', 'ARRAY_A'); define('DAY_IN_SECONDS', 86400);
function wp_json_encode($v, $flags = 0) { return json_encode($v, $flags); }
function untrailingslashit($s) { return rtrim($s, '/'); }
function home_url() { global $sites, $active; return $sites[$active]['url']; }
function rest_get_url_prefix() { return 'wp-json'; }
function rest_url($path) { return home_url() . '/wp-json/' . $path; }
function esc_url_raw($s) { return $s; }
function wp_parse_url($s, $component = -1) { return parse_url($s, $component); }
function sanitize_text_field($s) { return trim(strip_tags($s)); }
function sanitize_textarea_field($s) { return trim(strip_tags($s)); }
function wp_normalize_path($s) { return $s; }
function wp_mkdir_p($s) { return is_dir($s) || mkdir($s, 0777, true); }
function wp_generate_uuid4() { $s = bin2hex(random_bytes(16)); return substr($s, 0, 8) . '-' . substr($s, 8, 4) . '-4' . substr($s, 13, 3) . '-8' . substr($s, 17, 3) . '-' . substr($s, 20); }
function get_option($key, $default = false) { global $sites, $active; return $sites[$active]['options'][$key] ?? $default; }
function update_option($key, $v, $autoload = null) { global $sites, $active; $sites[$active]['options'][$key] = $v; return true; }
function add_option($key, $v, $deprecated = '', $autoload = null) { if (get_option($key, null) !== null) return false; return update_option($key, $v); }
function delete_option($key) { global $sites, $active; unset($sites[$active]['options'][$key]); }
function wp_cache_delete(...$args) {}
function wp_clear_scheduled_hook($hook) { global $cleared; $cleared[] = $hook; }
function current_user_can($cap) { return false; }
function wp_verify_nonce($v, $scope) { return $v === 'test'; }
function is_wp_error($v) { return $v instanceof WP_Error; }
function wp_remote_retrieve_response_code($r) { return $r['response']['code']; }
function wp_remote_retrieve_header($r, $key) { return $r['headers'][$key] ?? ''; }
function wp_remote_retrieve_body($r) { return $r['body']; }
class WP_Error { function __construct(public $code, public $message, public $data = []) {} }
class WP_REST_Request implements ArrayAccess {
    function __construct(private array $params = [], private array $headers = []) { $this->headers = array_change_key_case($headers); }
    function get_param($k) { return $this->params[$k] ?? null; }
    function get_header($k) { return $this->headers[strtolower($k)] ?? ''; }
    function get_body() { return json_encode($this->params); }
    function offsetExists($k): bool { return isset($this->params[$k]); }
    function offsetGet($k): mixed { return $this->get_param($k); }
    function offsetSet($k, $v): void { $this->params[$k] = $v; }
    function offsetUnset($k): void { unset($this->params[$k]); }
}
class TestDB {
    public $prefix = 'test_'; public PDO $db;
    function __construct() {
        $this->db = new PDO('sqlite::memory:'); $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec('CREATE TABLE test_feedbackpress_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, issue_id TEXT, network_id TEXT, kind TEXT, payload TEXT, created_at TEXT, environment TEXT)');
    }
    function prepare($sql, ...$args) { $i = 0; return preg_replace_callback('/%[sd]/', function ($m) use (&$i, $args) { $v = $args[$i++]; return $m[0] === '%d' ? (string) (int) $v : $this->db->quote($v); }, $sql); }
    function query($sql) { return $this->db->exec(str_replace('INSERT IGNORE', 'INSERT OR IGNORE', $sql)); }
    function get_results($sql, $format) { return $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC); }
    function get_var($sql) { return preg_match('/(GET_LOCK|RELEASE_LOCK)/', $sql) ? 1 : $this->db->query($sql)->fetchColumn(); }
}
require dirname(__DIR__) . '/includes/store.php';
require dirname(__DIR__) . '/includes/network.php';
require dirname(__DIR__) . '/includes/log.php';
require dirname(__DIR__) . '/includes/api.php';
require dirname(__DIR__) . '/includes/sync.php';

use FeedbackPress\{Network, Sync, Store, Log, API};
function check($v, $message) { if (!$v) throw new RuntimeException($message); echo "PASS $message\n"; }
$sites = []; $active = null; $wpdb = null; $requests = []; $faults = []; $cleared = [];
function select_site($name) {
    global $root, $sites, $active, $wpdb;
    if (is_link($root . '/current')) unlink($root . '/current');
    symlink($root . '/' . $name, $root . '/current'); clearstatcache(true);
    $active = $name; $wpdb = $sites[$name]['db'];
}
function site($name, $url) {
    global $root, $sites;
    mkdir($root . '/' . $name . '/public', 0777, true);
    $sites[$name] = ['url' => $url, 'options' => [], 'db' => new TestDB(), 'basic' => ''];
    select_site($name); Network::upgrade();
}
function copy_site($source, $destination, $url, ?array $options = null) {
    global $sites;
    if (!isset($sites[$destination])) site($destination, $url);
    $sites[$destination]['options'] = $options ?? $sites[$source]['options'];
    $sites[$destination]['db'] = new TestDB();
    foreach ($sites[$source]['db']->get_results('SELECT * FROM test_feedbackpress_events', ARRAY_A) as $event) {
        $sites[$destination]['db']->db->prepare('INSERT INTO test_feedbackpress_events (seq,id,issue_id,network_id,kind,payload,created_at,environment) VALUES (?,?,?,?,?,?,?,?)')->execute(array_values($event));
    }
    select_site($destination); Network::upgrade();
}
function unlock() { delete_option('feedbackpress_sync_started_' . hash('sha256', Network::home())); delete_option('feedbackpress_peer_cooldowns'); }
function headers() { $l = Network::local(); return ['X-FeedbackPress-Network' => $l['network'], 'X-FeedbackPress-Member' => $l['member'], 'X-FeedbackPress-Token' => $l['token']]; }
function wp_remote_request($url, $args) {
    global $sites, $active, $requests, $faults;
    $from = $active; $peer = null;
    foreach ($sites as $name => $site) if (str_starts_with($url, $site['url'] . '/?')) $peer = $name;
    if (!$peer) throw new RuntimeException('External requests are forbidden in this test.');
    $path = substr($url, strpos($url, '/feedbackpress/v1/') + 18);
    $requests[] = ['from' => $from, 'to' => $peer, 'path' => $path, 'args' => $args];
    if (isset($faults[$peer]['status'])) return ['response' => ['code' => $faults[$peer]['status']], 'headers' => ['retry-after' => '120'], 'body' => 'secret response body never logged'];
    if (isset($faults[$peer]['json'])) return ['response' => ['code' => 200], 'headers' => [], 'body' => '<html>login</html>'];
    if ($sites[$peer]['basic'] && ($args['headers']['Authorization'] ?? '') !== $sites[$peer]['basic']) return ['response' => ['code' => 401], 'headers' => [], 'body' => 'Unauthorized'];
    select_site($peer);
    try {
        Network::upgrade();
        $params = json_decode($args['body'] ?? '{}', true); $r = new WP_REST_Request($params, $args['headers']);
        if ($path === 'network/join') $result = Network::accept_join($r);
        else {
            $permission = $path === 'sync/exchange' ? Network::exchange_permission($r) : Network::authenticate($r);
            if ($permission !== true) $result = $permission;
            elseif ($path === 'network/invite') $result = Network::issue_invite();
            elseif ($path === 'sync/exchange') $result = Sync::exchange($r);
            elseif (str_starts_with($path, 'sync/files/')) { $r['id'] = substr($path, 11); $result = isset($args['body']) ? Sync::put_file($r) : Sync::get_file($r); }
            else throw new RuntimeException('Unexpected route ' . $path);
        }
        if (!empty($faults[$peer]['lost_join']) && $path === 'network/join') { unset($faults[$peer]['lost_join']); return new WP_Error('timeout', 'lost response'); }
        if (!empty($faults[$peer]['lost_exchange']) && $path === 'sync/exchange') { unset($faults[$peer]['lost_exchange']); return new WP_Error('timeout', 'lost response'); }
        return ['response' => ['code' => $result instanceof WP_Error ? ($result->data['status'] ?? 400) : 200], 'headers' => [], 'body' => json_encode($result)];
    } finally { select_site($from); }
}
try {
    $_GET['rest_route'] = '/feedbackpress/v1/sync/exchange'; $_SERVER['HTTP_X_FEEDBACKPRESS_NETWORK'] = 'test';
    check(API::hosting_auth(true) === false, 'Hosting Basic Auth is not misread as a WordPress Application Password for member requests');
    $_GET['rest_route'] = '/wp/v2/posts'; check(API::hosting_auth(true), 'Hosting-auth handling leaves other plugins and WordPress routes alone');
    $_GET['rest_route'] = '/feedbackpress/v1/issues'; unset($_SERVER['HTTP_X_FEEDBACKPRESS_NETWORK']); check(API::hosting_auth(true), 'Application Password agent authentication remains available without plugin credentials');
    unset($_GET['rest_route']); $_SERVER['REQUEST_URI'] = '/subsite/wp-json/feedbackpress/v1/network/join'; check(!API::hosting_auth(true), 'Pretty permalink invitation routes also support hosting Basic Auth'); unset($_SERVER['REQUEST_URI']);
    site('remote', 'https://staging.example');
    $network = Network::data()['id']; $v = Network::view(); $rows = array_values($v['peers']); $rows[0]['basic_user'] = 'host-user'; $rows[0]['basic_password'] = 'private-password';
    Network::configure('Client review', $rows, $v['revision']); $sites['remote']['basic'] = 'Basic ' . base64_encode('host-user:private-password');
    $code = Network::export();
    check(!str_contains($code, 'https://staging.example') && !str_contains(get_option(Network::OPTION), 'https://staging.example'), 'Setup code and configuration survive literal URL find/replace');
    site('local', 'http://project.localhost:8080');
    $faults['remote']['lost_join'] = true;
    try { Network::join($code, 'local'); check(false, 'Lost response should fail'); } catch (RuntimeException $e) {}
    unlock(); Network::join($code, 'local');
    check(Network::self()['type'] === 'local' && Network::data()['id'] === $network, 'One-field join registers local URL; retry recovers a lost join response');
    $revision = Network::view()['revision'];
    try { Network::merge(Network::data()['events'], wp_generate_uuid4()); check(false, 'Wrong-network configuration must fail'); } catch (RuntimeException $e) {}
    check(Network::view()['revision'] === $revision, 'A stale in-flight exchange cannot merge another network’s configuration');
    $localMember = Network::local()['member']; $localIdentity = Network::local(); $localConfig = Network::data();
    check(count(Network::view()['peers']) === 2, 'Join imports the network directory and Basic Auth credentials');
    $faults['remote'] = ['status' => 403]; unlock(); $beforeExport = Network::view()['revision'];
    try { Network::export(); check(false, 'A failed invitation cannot produce a code'); }
    catch (RuntimeException $e) { check(str_contains($e->getMessage(), 'HTTP 403') && !str_contains($e->getMessage(), 'first remote URL'), 'Connection-code generation reports the actual remote error instead of asking to add an existing URL'); }
    check(Network::view()['revision'] === $beforeExport, 'A failed copy request does not rotate connected site credentials');
    $faults = []; unlock();
    $code2 = Network::export();
    site('production', 'https://production.example'); Network::join($code2, 'remote');
    select_site('local'); unlock(); Sync::run();
    check(count(Network::view()['peers']) === 3, 'New remote membership propagates through the bootstrap');
    $issueId = wp_generate_uuid4();
    $issue = Store::append($issueId, 'issue', ['author' => 'Client', 'author_id' => str_repeat('a',64), 'body' => 'Change the headline', 'path' => '/about/', 'target' => ['selector' => '#hero', 'text' => 'Headline', 'x' => .5, 'y' => .4], 'context' => []]);
    $pdf = "%PDF-1.4\n%%EOF";
    $f = Store::append($issueId, 'file', ['comment_id' => $issue['id'], 'name' => 'brief.pdf', 'mime' => 'application/pdf', 'size' => strlen($pdf), 'sha256' => hash('sha256', $pdf), 'expires_at' => time() + 3600, 'screenshot' => false]);
    check(Store::put_file($f['id'], $pdf), 'Attachment bytes are stored privately on the originating site');
    unlock(); $result = Sync::run();
    check(empty(array_filter($result['peers'], fn($p) => isset($p['error']))), 'Local initiates two-way exchanges with all reachable remote members');
    $count = count($requests); check(Sync::run()['state'] === 'cooldown' && count($requests) === $count, 'Installation-wide 60-second gate blocks repeated syncs across callers');
    foreach (['remote', 'production'] as $name) { select_site($name); check(Store::issue($issueId)['body'] === 'Change the headline' && is_file(Store::file_path($f['id'])), 'Feedback and attachment reach ' . $name); }
    $productionIssue = Store::issue($issueId); $status = Store::append($issueId, 'status', ['author' => 'Reviewer', 'status' => 'review', 'parents' => $productionIssue['heads']]);
    unlock(); Sync::run(); select_site('local'); unlock(); Sync::run();
    check(Store::issue($issueId)['status'] === 'review', 'A change on a remote reaches local on the next active exchange');
    $current=Store::issue($issueId);Store::append($issueId,'edit',['comment_id'=>$issueId,'author'=>'Client','author_id'=>str_repeat('a',64),'title'=>'Revised headline issue','body'=>'Revised headline description','parents'=>$current['edit_heads']]);unlock();Sync::run();
    foreach(['remote','production'] as $peerName){select_site($peerName);check(Store::issue($issueId)['body']==='Revised headline description'&&Store::issue($issueId)['title']==='Revised headline issue','Comment edits synchronize in place to '.$peerName);}select_site('local');
    unlink(Store::file_path($f['id'])); clearstatcache(); unlock(); Sync::run();
    check(is_file(Store::file_path($f['id'])), 'Missing local attachment repairs even when its event was already synchronized');
    select_site('remote'); unlink(Store::file_path($f['id'])); clearstatcache(); select_site('local'); unlock(); Sync::run(); select_site('remote');
    check(is_file(Store::file_path($f['id'])), 'Missing remote attachment repairs without permanent sent-file receipts');
    $wpdb->query("DELETE FROM test_feedbackpress_events WHERE id='" . $status['id'] . "'"); select_site('local'); unlock(); Sync::run(); select_site('remote');
    check(Store::issue($issueId)['status'] === 'review', 'Inventory exchange repairs feedback lost in a database restore');
    select_site('local'); $before = count(Store::events()); unlock(); Sync::run(); check(count(Store::events()) === $before, 'Repeated delivery deduplicates immutable events');
    $snapshot = Sync::activity(new WP_REST_Request(['since' => 0])); check(count($snapshot['issues']) === 1 && $snapshot['new_issues'] === [$issueId] && $snapshot['network'] === $network, 'Activity returns a live snapshot without browser-to-peer credentials');
    foreach ([401, 403, 500, 429] as $http) {
        $faults['remote'] = ['status' => $http]; unlock(); $peer = array_values(array_filter(Network::view()['peers'], fn($p) => $p['url'] === 'https://staging.example'))[0];
        try { Sync::request($peer, 'sync/exchange', []); } catch (RuntimeException $e) {}
        $log = array_values(array_filter(Log::entries(), fn($r) => ($r['status'] ?? 0) === $http));
        check(count($log) > 0 && end($log)['retry_at'] >= time() + ($http === 429 ? 119 : 59), 'HTTP ' . $http . ' recorded with retry timing');
        $count = count($requests); try { Sync::request($peer, 'sync/exchange', []); } catch (RuntimeException $e) {} check(count($requests) === $count, 'Peer cooldown avoids immediate retries after HTTP ' . $http);
    }
    $faults['remote'] = ['json' => true]; unlock(); try { Sync::request($peer, 'sync/exchange', []); } catch (RuntimeException $e) {} $lastLog = Log::entries(); check(end($lastLog)['error'] === 'invalid_json', 'HTML/login responses are distinguishable from successful API replies'); $faults = [];
    for ($i = 0; $i < 180; $i++) Log::add(['operation' => 'bounded', 'url' => str_repeat('x', 1900), 'password' => 'must-not-log']);
    check(count(Log::entries()) <= 100 && strlen(get_option(Log::KEY)) <= 65536 && !str_contains(json_encode(Log::entries()), 'must-not-log'), 'Local logs have hard count/size caps and an explicit field allowlist');
    $rows = Log::entries(); $rows[] = ['time' => time() - 4 * DAY_IN_SECONDS, 'error' => 'too_old']; update_option(Log::KEY, Network::pack($rows));
    check(!in_array('too_old', array_column(Log::entries(), 'error')), 'Diagnostics older than three days are excluded');
    Log::add(['operation' => 'prune']);
    $events = Network::data(); $a = $events; $b = $events;
    Network::change($a, 'name', 'name', 'A'); Network::change($b, 'name', 'name', 'B'); $a['events'][count($a['events']) - 1]['at'] = '2099-01-01T00:00:00Z';
    Network::persist($a); Network::persist($b);
    check(isset(Network::view()['conflicts']['name:name']), 'Concurrent configuration changes survive skewed clocks without last-writer data loss');
    $v = Network::view(); Network::configure('Resolved', array_values($v['peers']), $v['revision']); check(Network::view()['name'] === 'Resolved' && !Network::view()['conflicts'], 'Saving a resolution supersedes both configuration parents');
    $revokedHeaders = headers(); select_site('remote'); unlock(); Sync::run();
    $v = Network::view(); Network::configure($v['name'], array_values(array_filter($v['peers'], fn($p) => $p['id'] !== $localMember)), $v['revision']);
    $savedView = Network::view(); Network::configure($savedView['name'], array_values($savedView['peers']), $savedView['revision']);
    check(Network::view()['revision'] === $savedView['revision'], 'Saving unchanged settings does not grow configuration history after a removal');
    check(Network::authenticate(new WP_REST_Request([], $revokedHeaders)) instanceof WP_Error, 'Removing a URL revokes its member credentials');
    $invite = Network::unpack($code); $reuse = Network::accept_join(new WP_REST_Request(['network' => $network, 'ticket' => $invite['ticket'], 'token' => str_repeat('b', 64), 'url' => 'https://uninvited.example', 'type' => 'remote']));
    check($reuse instanceof WP_Error, 'A consumed setup code cannot authorize a different installation');
    Network::create('Separate project'); check(Store::issues() === [], 'A new network gets a blank issue namespace');
    $data = Network::data(); $data['id'] = $network; Network::persist($data, true); check(Store::issue($issueId) !== null, 'Prior network feedback remains stored separately');
    Store::append($issueId, 'expire', ['file_id' => $f['id']]); Network::create('Archived cleanup'); Store::cleanup();
    check(!is_file(Store::file_path($f['id'])), 'Expired attachments are physically removed even when their network is archived');
    foreach (['http://localhost', 'http://10.0.0.3', 'http://[::1]', 'https://name.test', 'https://name.local.dev'] as $url) check(in_array(Network::suggested_type($url), ['local', 'remote'], true), 'URL classification accepts ' . $url);
    check(Network::suggested_type('https://[2606:4700:4700::1111]') === 'remote', 'Public IPv6 is not mistaken for a local hostname');
    site('seedlocal', 'http://seed.localhost');
    $seedId = Network::data()['id']; $seedIssue = wp_generate_uuid4();
    Store::append($seedIssue, 'issue', ['author' => 'Client', 'body' => 'Existing local feedback', 'path' => '/', 'target' => ['selector' => '', 'text' => '', 'x' => 0.5, 'y' => 0.5], 'context' => []]);
    $v = Network::view(); $rows = array_values($v['peers']); $rows[] = ['id' => wp_generate_uuid4(), 'url' => 'https://first-remote.example', 'type' => 'remote'];
    Network::configure('Starts locally', $rows, $v['revision']); $seedCode = Network::export(); $seed = Network::unpack($seedCode);
    check($seed['format'] === 2 && !str_contains($seedCode, 'https://first-remote.example'), 'A local-only network can provision its first configured remote with an encoded URL-bound code');
    site('wrong-seed', 'https://wrong-target.example');
    try { Network::join($seedCode, 'remote'); check(false, 'Provisioning must reject another URL'); } catch (InvalidArgumentException $e) {}
    site('seedremote', 'https://first-remote.example'); Network::join($seedCode, 'remote');
    check(Network::data()['id'] === $seedId && !hash_equals(Network::self()['token_hash'], hash('sha256', $seed['token'])), 'First remote adopts the original network and immediately rotates the provisioning credential');
    select_site('seedlocal'); unlock(); Sync::run(); select_site('seedremote');
    check(Store::issue($seedIssue)['body'] === 'Existing local feedback', 'Starting on local preserves and synchronizes existing feedback without creating a replacement network');
    $remoteId = Network::self()['id']; select_site('seedlocal'); $copiedIdentity = Network::local();
    select_site('seedremote'); update_option(Network::LOCAL, Network::pack($copiedIdentity)); Network::upgrade();
    check(Network::self() !== null && Network::self()['id'] === $remoteId, 'A copied local identity automatically binds to the existing remote URL');
    select_site('seedlocal'); unlock(); $migrated = Sync::run();
    check(empty(array_filter($migrated['peers'], fn($p) => isset($p['error']))), 'Local authenticates with a migrated remote before its replacement credential has propagated');
    select_site('seedremote'); unlock(); Sync::run();
    check(Network::self() !== null && Store::issue($seedIssue) !== null && !Network::view()['conflicts'], 'Repeated migration reconciles the destination credential without a reconnect code or feedback loss');
    site('migrate-local', 'http://migrate.localhost');
    $migrationNetwork = Network::data()['id']; $sourceIdentity = Network::local();
    $migrationIssue = wp_generate_uuid4();
    Store::append($migrationIssue, 'issue', ['author' => 'Client', 'body' => 'Copied feedback', 'path' => '/', 'target' => ['selector' => '', 'text' => '', 'x' => .5, 'y' => .5], 'context' => []]);
    $image = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7cAAAAASUVORK5CYII=');
    $imageEvent = Store::append($migrationIssue, 'file', ['name' => 'capture.png', 'mime' => 'image/png', 'size' => strlen($image), 'sha256' => hash('sha256', $image), 'expires_at' => time() + 3600, 'screenshot' => true]);
    Store::put_file($imageEvent['id'], $image);
    $requestsBeforeCopy = count($requests);
    copy_site('migrate-local', 'migrate-stage', 'https://migrated-staging.example');
    $stageIdentity = Network::local(); $stageRevision = Network::view()['revision'];
    check(Network::data()['id'] === $migrationNetwork && Network::self()['url'] === 'https://migrated-staging.example' && Network::self()['type'] === 'remote' && $stageIdentity['member'] !== $sourceIdentity['member'] && $stageIdentity['token'] !== $sourceIdentity['token'], 'An unknown migrated URL stays in its network with a distinct URL-bound identity');
    Network::upgrade();
    check(Network::local() === $stageIdentity && Network::view()['revision'] === $stageRevision && count($requests) === $requestsBeforeCopy, 'Copy identification is idempotent and makes no unattended HTTP requests');
    select_site('migrate-local');
    check(Network::local() === $sourceIdentity, 'Registering a new copy leaves the original local identity intact');
    $v = Network::view(); $rows = array_values($v['peers']); $rows[] = ['id' => wp_generate_uuid4(), 'url' => 'https://migrated-staging.example', 'type' => 'remote'];
    Network::configure($v['name'], $rows, $v['revision']); unlock(); $result = Sync::run();
    check(empty(array_filter($result['peers'], fn($p) => isset($p['error']))) && count(array_filter(Network::view()['peers'], fn($p) => $p['url'] === 'https://migrated-staging.example')) === 1, 'A configured remote without a known credential can be discovered after migration, without a setup code or duplicate URL: ' . json_encode($result));
    $migrationSnapshot = $sites['migrate-local']['options'];
    select_site('migrate-stage');
    check(is_file(Store::file_path($imageEvent['id'])) && Network::self() !== null && !Network::view()['conflicts'], 'A database-only migrated copy receives missing screenshot bytes through normal sync');
    copy_site('migrate-stage', 'migrate-laptop', 'http://second-laptop.localhost');
    $laptopIdentity = Network::local(); unlock(); $result = Sync::run();
    check(empty(array_filter($result['peers'], fn($p) => isset($p['error']))) && empty(Network::local()['copy_pending']), 'A remote-to-local database copy registers itself using the copied membership during its first active exchange');
    select_site('migrate-stage');
    check(isset(Network::view()['peers'][$laptopIdentity['member']]) && Store::issue($migrationIssue) !== null, 'The remote learns the additional local URL without contacting that unreachable local site');
    select_site('migrate-local'); unlock(); Sync::run();
    check(isset(Network::view()['peers'][$laptopIdentity['member']]), 'Another active copy retains the newer directory before the destination database is overwritten');
    // Copy an older local directory over an already-connected destination.
    copy_site('migrate-local', 'migrate-stage', 'https://migrated-staging.example', $migrationSnapshot);
    select_site('migrate-local'); unlock(); $result = Sync::run();
    check(empty(array_filter($result['peers'], fn($p) => isset($p['error']))), 'A full repeat database migration repairs stale destination credentials automatically');
    select_site('migrate-stage');
    check(Network::self() !== null && !Network::view()['conflicts'] && isset(Network::view()['peers'][$laptopIdentity['member']]), 'Directory events lost in a repeat migration recover from another active copy');
    copy_site('migrate-stage', 'migrate-retry', 'http://retry-laptop.localhost');
    $retryIdentity = Network::local(); $faults['migrate-stage']['lost_exchange'] = true;
    unlock(); $result = Sync::run();
    check(count(array_filter($result['peers'], fn($p) => isset($p['error']))) === 1, 'A lost registration response remains a recoverable background connection error');
    select_site('migrate-stage'); $acceptedRevision = Network::view()['revision'];
    select_site('migrate-retry'); Network::upgrade(); unlock(); $result = Sync::run();
    check(empty(array_filter($result['peers'], fn($p) => isset($p['error']))) && Network::local()['member'] === $retryIdentity['member'] && Network::local()['token'] === $retryIdentity['token'], 'Retry after a lost response keeps the same copied-site identity');
    select_site('migrate-stage');
    check(Network::view()['revision'] === $acceptedRevision && count(array_filter(Network::view()['peers'], fn($p) => $p['url'] === $retryIdentity['url'])) === 1, 'Retrying automatic registration creates neither duplicate sites nor extra configuration versions');
    $v = Network::view(); Network::configure($v['name'], array_values(array_filter($v['peers'], fn($p) => $p['id'] !== $laptopIdentity['member'])), $v['revision']);
    $revokedConfig = Network::data();
    select_site('migrate-laptop'); unlock(); $result = Sync::run();
    check(count(array_filter($result['peers'], fn($p) => str_contains($p['error'] ?? '', '403'))) > 0, 'A revoked migrated copy cannot bypass remote authentication using its copied source credentials');
    Network::merge($revokedConfig['events'], $revokedConfig['id']);
    check(Network::self() === null, 'Receiving a removal disconnects a previously migrated copy');
    Network::upgrade(); check(Network::self() === null, 'Automatic copy detection never undoes a received removal');
    select_site('migrate-stage');
    $denied = Network::exchange_permission(new WP_REST_Request(['copy' => array_merge($sourceIdentity, ['url' => $laptopIdentity['url']])], ['X-FeedbackPress-Network' => $migrationNetwork, 'X-FeedbackPress-Member' => $laptopIdentity['member'], 'X-FeedbackPress-Token' => $laptopIdentity['token']]));
    check($denied instanceof WP_Error, 'Copied source credentials cannot silently re-register a revoked URL');
    $stranger = ['X-FeedbackPress-Network' => $migrationNetwork, 'X-FeedbackPress-Member' => wp_generate_uuid4(), 'X-FeedbackPress-Token' => bin2hex(random_bytes(32))];
    $badProof = array_merge($sourceIdentity, ['token' => bin2hex(random_bytes(32)), 'url' => 'https://not-a-copy.example']);
    check(Network::exchange_permission(new WP_REST_Request(['copy' => $badProof], $stranger)) instanceof WP_Error && Network::exchange_permission(new WP_REST_Request([], $stranger)) instanceof WP_Error, 'A network ID or an invalid copied credential cannot authorize a new URL');
    check(Network::exchange_permission(new WP_REST_Request(['copy' => ['member' => [], 'network' => [], 'token' => []]], $stranger)) instanceof WP_Error, 'Malformed copied credentials are denied cleanly instead of causing a server error');
    check(!str_contains(json_encode(Log::entries()), $sourceIdentity['token']), 'Automatic registration never puts copied credentials in diagnostics');
    copy_site('migrate-stage', 'removed-copy', $laptopIdentity['url']);
    check(Network::self() === null && Network::data()['id'] === $migrationNetwork, 'Migrating onto a URL already removed from the directory requires intentional reconnection');
    site('numbers-remote', 'https://numbering.example'); $numberCode = Network::export();
    $originalNumbers = []; $note = ['author' => 'Client', 'body' => 'Numbering check', 'path' => '/', 'target' => ['selector' => '', 'text' => '', 'x' => .5, 'y' => .5], 'context' => []];
    for ($n = 1; $n <= 3; $n++) { $id = wp_generate_uuid4(); Store::append($id, 'issue', $note); $originalNumbers[$id] = (string) $n; }
    $codedId = wp_generate_uuid4(); $codedEvent = ['id' => wp_generate_uuid4(), 'issue_id' => $codedId, 'kind' => 'issue', 'payload' => $note + ['number' => '61F84166-1'], 'created_at' => '2026-11-10T12:00:00Z', 'environment' => 'remote'];
    Store::insert($codedEvent); $beforeNumbering = Store::issue($codedId);
    check(Store::normalize_numbers() === 1 && Store::issue($codedId)['number'] === '4', 'A prefixed issue becomes number 4 while existing 1, 2, and 3 are retained');
    $afterNumbering = Store::issue($codedId); unset($beforeNumbering['number'], $afterNumbering['number']);
    check($beforeNumbering === $afterNumbering, 'Converting an issue number preserves all content, authors, statuses, IDs, and dates');
    $cursor = Store::cursor(); check(Store::normalize_numbers() === 0 && Store::cursor() === $cursor, 'Number conversion is idempotent');
    site('numbers-local', 'http://numbering.localhost'); Network::join($numberCode, 'local'); unlock(); Sync::run();
    check(Store::issue($codedId)['number'] === '4', 'Corrected numeric references propagate to another environment');
    $localIssue = '10000000-1111-4111-8111-111111111111'; Store::append($localIssue, 'issue', $note);
    check(Store::issue($localIssue)['number'] === '5', 'A joined environment uses the next network number instead of its member prefix');
    select_site('numbers-remote'); $remoteIssue = '20000000-1111-4111-8111-111111111111'; Store::append($remoteIssue, 'issue', $note);
    check(Store::issue($remoteIssue)['number'] === '5', 'Disconnected environments can initially allocate the same provisional number');
    select_site('numbers-local'); unlock(); $result = Sync::run();
    check(empty(array_filter($result['peers'], fn($p) => isset($p['error']))) && Store::issue($localIssue)['number'] === '5' && Store::issue($remoteIssue)['number'] === '6', 'Sync deterministically resolves an offline number collision without overwriting either issue');
    foreach ($originalNumbers as $id => $n) check(Store::issue($id)['number'] === $n, 'Existing issue ' . $n . ' keeps its reference after synchronization');
    select_site('numbers-remote');
    check(Store::issue($localIssue)['number'] === '5' && Store::issue($remoteIssue)['number'] === '6', 'Both environments agree on the repaired numeric references');
    Store::append($remoteIssue, 'delete', ['author' => 'Client']); $nextId = wp_generate_uuid4(); Store::append($nextId, 'issue', $note);
    check(Store::issue($nextId)['number'] === '7', 'Deleted issue numbers are never reused');
    $missingId = '12345678-1111-4111-8111-111111111111'; $missingEvent = $codedEvent; $missingEvent['id'] = wp_generate_uuid4(); $missingEvent['issue_id'] = $missingId; $missingEvent['payload'] = $note;
    Store::insert($missingEvent); Store::normalize_numbers();
    check(Store::issue($missingId)['number'] === '8', 'An unnumbered old issue receives the next number instead of treating its UUID fragment as a numeric reference');
    update_option('feedbackpress_number_' . md5(Network::data()['id']), 0); $restoredId = wp_generate_uuid4(); Store::append($restoredId, 'issue', $note);
    check(Store::issue($restoredId)['number'] === '9', 'Restoring an old counter cannot reuse synchronized or corrected numbers');
    foreach ($requests as $request) {
        check($request['args']['headers']['User-Agent'] === Sync::user_agent() && $request['args']['redirection'] === 0 && $request['args']['sslverify'], 'Transport identifies FeedbackPress and keeps TLS/redirect safeguards'); break;
    }
    check(count(array_filter($requests, fn($r) => $r['to'] === 'local')) === 0, 'Remote installations never attempt incoming connections to local copies');
    check(in_array('feedbackpress_tick', $cleared), 'Old recurring sync is unscheduled; the harness scheduled no jobs');
    echo "Network integration checks passed. Isolated SQLite sites; zero external HTTP requests.\n";
} finally {
    if (is_link($root . '/current')) unlink($root . '/current');
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) $file->isDir() ? rmdir($file) : unlink($file);
    rmdir($root);
}
}
