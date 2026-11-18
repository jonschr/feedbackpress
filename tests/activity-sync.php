<?php
// Standalone gateway fixture: no WordPress database, HTTP, credentials or feedback writes.
namespace FeedbackPress;
define('ABSPATH', __DIR__ . '/');
class Service {
    public static array $calls = [];
    public static bool $changed = false;
    public static bool $fail = false;
    public static function connection(): array { return ['project' => 'fixture']; }
    public static function request($method, $path, ...$args): array {
        self::$calls[] = [$method, $path];
        if (self::$fail) throw new \RuntimeException('Unavailable', 503);
        return ['changes' => self::$changed ? [['cursor' => '12']] : []];
    }
    public static function snapshot(): array { self::$calls[] = ['GET', 'snapshot']; return ['issues' => [['id' => 'synthetic']], 'cursor' => '12']; }
}
class Admin { public static function routes($route): void {} }
class ReviewAccess { public static function routes($route): void {} }
class ErrorResult { public function __construct(public $code, public $message, public $data) {} }
class_alias(ErrorResult::class, 'WP_Error');
class Request { public function __construct(private $since) {} public function get_param($key) { return $this->since; } }
function register_rest_route($ns, $path, $args) { $GLOBALS['routes'][$path] = $args; }
function add_filter(...$args) {}
function get_transient($key) { return $GLOBALS['transient'] ?? false; }
function set_transient($key, $value, $ttl) { $GLOBALS['ttl'] = $ttl; }
function is_user_logged_in() { return $GLOBALS['loggedIn']; }
function get_option($key, $fallback) { return $GLOBALS['lock'] ?? $fallback; }
function delete_option($key) { unset($GLOBALS['lock']); }
function add_option($key, $value, ...$args) { if (isset($GLOBALS['lock'])) return false; $GLOBALS['lock'] = $value; return true; }
function home_url() { return 'https://fixture.test/'; }
function untrailingslashit($value) { return rtrim($value, '/'); }
require dirname(__DIR__) . '/includes/api.php';
API::routes();
$run = $GLOBALS['routes']['/sync/activity']['callback'];
$check = function ($value) { if (!$value) throw new \RuntimeException('Activity gateway assertion failed'); };
$GLOBALS['loggedIn'] = true;
$data = $run(new Request('0')); $check($data['cursor'] === '12' && count($data['issues']) === 1 && $GLOBALS['ttl'] === 30 && !isset($GLOBALS['lock']));
Service::$calls = []; $data = $run(new Request('12')); $check($data['state'] === 'unchanged' && !isset($data['issues']) && Service::$calls === [['GET', '/changes?after=12']] && !isset($GLOBALS['lock']));
Service::$changed = true; Service::$calls = []; $data = $run(new Request('11')); $check(count($data['issues']) === 1 && count(Service::$calls) === 3);
Service::$calls = []; $run(new Request('12&inject=true')); $check(Service::$calls[0] === ['POST', '/sites']);
$GLOBALS['loggedIn'] = false; $GLOBALS['transient'] = '12'; Service::$calls = []; $data = $run(new Request('11')); $check($data['state'] === 'throttled' && Service::$calls === []);
unset($GLOBALS['transient']); $data = $run(new Request('11')); $check(count($data['issues']) === 1 && $GLOBALS['ttl'] === 30);
$GLOBALS['lock'] = time() + 60; Service::$calls = []; $data = $run(new Request('11')); $check($data['state'] === 'busy' && Service::$calls === []); unset($GLOBALS['lock']);
Service::$fail = true; $error = $run(new Request('11'));
$check($error instanceof ErrorResult && $error->data['status'] === 503 && !isset($GLOBALS['lock']));
$check($GLOBALS['routes']['/sync/activity']['permission_callback'] === [API::class, 'read']);
echo "PASS activity cursor skips unchanged snapshots, validates cursor, refreshes changed/initial state, bounds guest refresh to 30 seconds, coalesces callers and releases locks on failure.\n";
