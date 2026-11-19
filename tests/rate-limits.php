<?php
// Isolated permission/clock/storage fixture: no WordPress database, network or mail.
namespace {
    define('ABSPATH', __DIR__);
    class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
    class WP_REST_Request {
        public array $headers = ['origin' => 'https://feedbackpress.test', 'x-wp-nonce' => 'valid'];
        public function get_header($name) { return $this->headers[strtolower($name)] ?? ''; }
        public string $route = '/feedbackpress/v1/sync/activity';
        public function get_route() { return $this->route; }
    }
    $clock = 6010; $user = 1; $counters = []; $routes = []; $filters = []; $authEvents = 0; $verifiedEmail = true;
}
namespace FeedbackPress {
    class Service { static function connection() { return ['project' => 'project-a']; } static function ensureConnection() {} }
    class Identity { static function id($email) { return hash('sha256', $email); } }
    class Admin { static function routes($route) {} }
    class Email_Verification { static function current() { return $GLOBALS["verifiedEmail"] ? ["email"=>"guest@example.test"] : null; } }
    class ReviewAccess { static function routes($route) {} }
    function time() { return $GLOBALS['clock']; }
    function is_user_logged_in() { return $GLOBALS['user'] > 0; }
    function get_current_user_id() { return $GLOBALS['user']; }
    function wp_get_current_user() { return (object) ['user_email' => 'owner@example.test']; }
    function current_user_can($cap) { return $cap === 'manage_options' && $GLOBALS['user'] === 1; }
    function settings() { return ['mode' => 'everyone']; }
    function bound() { return true; }
    function home_url() { return 'https://feedbackpress.test'; }
    function wp_parse_url($value) { return parse_url($value); }
    function wp_verify_nonce($nonce, $action) { return $nonce === 'valid'; }
    function did_action($name) { return $GLOBALS['authEvents']; }
    function wp_unslash($value) { return $value; }
    function sanitize_text_field($value) { return trim(strip_tags($value)); }
    function wp_salt() { return 'synthetic-test-salt'; }
    function get_transient($key) { $row = $GLOBALS['counters'][$key] ?? null; return $row && $row[1] > time() ? $row[0] : false; }
    function set_transient($key, $value, $ttl) { $GLOBALS['counters'][$key] = [$value, time() + $ttl]; }
    function register_rest_route($namespace, $route, $args) { $GLOBALS['routes']['/' . $namespace . $route] = $args; }
    function add_filter($name, $callback, ...$args) { $GLOBALS['filters'][$name] = $callback; }
}
namespace {
    require dirname(__DIR__) . '/includes/api.php';
    use FeedbackPress\API;
    function check($ok, $message) { if (!$ok) throw new \RuntimeException($message); }
    $_SERVER['REMOTE_ADDR'] = '192.0.2.1'; $request = new WP_REST_Request();
    for ($i = 0; $i < 600; $i++) check(API::write($request) === true, 'Rapid authenticated changes denied');
    $limit = API::write($request); check($limit instanceof WP_Error && $limit->data === ['status' => 429, 'retry_after' => 50], 'Missing short fixed-window limit');
    $before = $counters; $clock = 6040; $again = API::write($request); check($again->data['retry_after'] === 20 && $counters === $before, 'Rejection extended the window');
    $user = 2; check(API::write($request) === true, 'Same-IP WordPress user shares another user budget');
    $user = 0; for ($i = 0; $i < 120; $i++) check(API::write($request) === true, 'Guest budget denied early');
    $request->headers['x-feedbackpress-actor'] = 'forged'; $request->headers['x-forwarded-for'] = '192.0.2.99';
    check(API::write($request) instanceof WP_Error, 'Browser actor/proxy overrides reset guest budget');
    $_SERVER['REMOTE_ADDR'] = '192.0.2.2'; check(API::write($request) === true, 'Separate guest IP shares budget');
    $user = 1; API::routes(); $before = $counters;
    check(($routes['/feedbackpress/v1/sync/activity']['permission_callback'])($request) === true && $before === $counters, 'Background snapshot consumes change budget');
    $response = new class($limit) {
        public array $headers = [];
        public function __construct(private WP_Error $error) {}
        public function header($name, $value) { $this->headers[$name] = $value; }
        public function get_status() { return 429; }
        public function get_data() { return ['data' => $this->error->data]; }
    };
    $filters['rest_post_dispatch']($response, null, $request); check($response->headers['Retry-After'] === '50', 'Retry-After missing');
    $request->headers['origin'] = 'https://foreign.example'; check(API::write($request)->data['status'] === 403, 'Foreign-origin write accepted');
    $request->headers['origin'] = 'https://feedbackpress.test'; $request->headers['x-wp-nonce'] = 'invalid'; check(API::write($request)->data['status'] === 403, 'Invalid nonce accepted');
    $request->headers['x-wp-nonce'] = 'valid'; $clock = 6060; check(API::write($request) === true, 'Fixed minute did not recover');
    $user=2;$request->headers['origin']='';$request->headers['x-wp-nonce']='invalid';$authEvents=1;check(API::write($request)===true,'Authenticated application password writer needed a browser nonce');$authEvents=0;check(API::write($request)->data['status']===403,'Cookie auth bypassed nonce without machine authentication');$authEvents=1;$request->headers['origin']='https://foreign.example';check(API::write($request)->data['status']===403,'Foreign origin bypassed protection with machine auth');$authEvents=0;
    $user=0;$request->headers['origin']='https://feedbackpress.test';$request->headers['x-wp-nonce']='valid';$verifiedEmail=false;check(API::write($request)->data['status']===403,'Unverified guest contributed');check(API::write($request,false)===true,'Verification request itself required verification');$verifiedEmail=true;
    $binary = new class { public function get_headers() { return ['X-FeedbackPress-Binary'=>'1']; } public function get_data() { return '%PDF-1.7 binary'; } };
    $request->route='/another-plugin/v1/files/one';ob_start();$served=$filters['rest_pre_serve_request'](false,$binary,$request);$bytes=ob_get_clean();check($served===false&&$bytes==='', 'Binary hook intercepted another plugin');
    $request->route='/feedbackpress/v1/files/11111111-1111-4111-8111-111111111111';ob_start();$served=$filters['rest_pre_serve_request'](false,$binary,$request);$bytes=ob_get_clean();check($served===true&&$bytes==='%PDF-1.7 binary','Binary output was escaped or lost');
    echo "PASS Per-project/native-user 600/min and guest-IP 120/min budgets, same-IP isolation, uncharged background refresh, fixed-window recovery, Retry-After and unchanged origin/nonce protection. No database/HTTP/mail.\n";
}
