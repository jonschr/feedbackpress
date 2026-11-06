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
        $params = json_decode($args['body'] ?? '{}', true); $r = new WP_REST_Request($params, $args['headers']);
        if ($path === 'network/join') $result = Network::accept_join($r);
        else {
            $permission = Network::authenticate($r);
            if ($permission !== true) $result = $permission;
            elseif ($path === 'network/invite') $result = Network::issue_invite();
            elseif ($path === 'sync/exchange') $result = Sync::exchange($r);
            elseif (str_starts_with($path, 'sync/files/')) { $r['id'] = substr($path, 11); $result = isset($args['body']) ? Sync::put_file($r) : Sync::get_file($r); }
            else throw new RuntimeException('Unexpected route ' . $path);
        }
        if (!empty($faults[$peer]['lost_join']) && $path === 'network/join') { unset($faults[$peer]['lost_join']); return new WP_Error('timeout', 'lost response'); }
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
    $oldHome = $sites['local']['url']; $sites['local']['url'] = 'https://accidental-clone.example';
    check(Network::self() === null && Sync::run()['state'] === 'disconnected', 'A copied database at another URL cannot sync without joining'); $sites['local']['url'] = $oldHome;
    $code2 = Network::export();
    site('production', 'https://production.example'); Network::join($code2, 'remote');
    select_site('local'); unlock(); Sync::run();
    check(count(Network::view()['peers']) === 3, 'New remote membership propagates through the bootstrap');
    $issueId = wp_generate_uuid4();
    $issue = Store::append($issueId, 'issue', ['author' => 'Client', 'body' => 'Change the headline', 'path' => '/about/', 'target' => ['selector' => '#hero', 'text' => 'Headline', 'x' => .5, 'y' => .4], 'context' => []]);
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
    select_site('seedremote'); update_option(Network::LOCAL, Network::pack($copiedIdentity)); check(Network::self() === null, 'Copying local identity onto the same remote URL disconnects it safely');
    select_site('seedlocal'); $reconnect = Network::provision($remoteId);
    select_site('seedremote'); Network::join($reconnect, 'remote'); check(Network::self() !== null && Store::issue($seedIssue) !== null, 'An explicit URL-bound reconnect restores a copied remote while retaining network feedback');
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
