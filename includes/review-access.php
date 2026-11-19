<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;

final class ReviewAccess {
    const COOKIE = '__Secure-feedbackpress-review';
    const FLAG = 'feedbackpress_review_active';
    private static array $checked = [];
    public static function member(?array $connection = null): bool {
        return is_user_logged_in() && in_array(($connection ?? Service::connection())['project'] ?? '', (array) get_user_meta(get_current_user_id(), 'feedbackpress_projects', true), true);
    }
    public static function cookie(): string {
        $value = sanitize_text_field(wp_unslash($_COOKIE[self::COOKIE] ?? ''));
        return preg_match('/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/D', $value) ? $value : '';
    }
    public static function grant(?string $token = null, ?array $connection = null): ?array {
        $token = $token ?? self::cookie();
        if (settings()['mode'] === 'disabled' || !is_string($token) || !preg_match('/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/D', $token)) return null;
        $c = $connection ?? Service::connection();
        if (empty($c['token']) || empty($c['project']) || empty($c['service']) || empty($c['credential_id']) || !empty($c['disconnected']) || ($c['site_url'] ?? '') !== Service::home() || wp_parse_url(Service::home(), PHP_URL_SCHEME) !== 'https') return null;
        $key = hash('sha256', Service::pack($c) . $token);
        if (array_key_exists($key, self::$checked)) return self::$checked[$key];
        // Check centrally once per request so project-wide revocation also ends existing guest sessions.
        try {
            $link = Service::http('POST', Service::origin($c['service']) . '/v1/projects/' . $c['project'] . '/review-link', $c['token'], ['token' => $token], site: Service::home());
            $prefix = Service::home() . '/#fp-review=';
            if (!str_starts_with($link['url'] ?? '', $prefix)) return self::$checked[$key] = null;
            $canonical = substr($link['url'], strlen($prefix));
            if (!preg_match('/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/D', $canonical) || !str_starts_with($canonical, $c['credential_id'] . '.')) return self::$checked[$key] = null;
            $grant = ['authorized' => true, 'token' => $canonical];
            self::$checked[hash('sha256', Service::pack($c) . $canonical)] = $grant;
            return self::$checked[$key] = $grant;
        } catch (\Throwable $e) { return self::$checked[$key] = null; }
    }
    public static function inviteAccount(string $proof): void {
        $c = Service::connection();
        $data = Service::http('POST', Service::origin($c['service']) . '/v1/projects/' . $c['project'] . '/invitations/recipient', $c['token'], ['token' => $proof], site: Service::home());
        if (empty($data['recipient'])) return;
        $email = strtolower(trim($data['recipient']['email'] ?? '')); $name = sanitize_text_field($data['recipient']['name'] ?? '');
        if (!is_email($email) || !$name) throw new \RuntimeException('Could not prepare your FeedbackPress account.', 503);
        Service::locked(function () use ($email, $name, $c, $data) {
            $user = get_user_by('email', $email);
            if (!$user && empty($data['create_account'])) return;
            if (!$user) {
                if (!get_role('feedbackpress_reviewer')) add_role('feedbackpress_reviewer', 'FeedbackPress reviewer', ['feedbackpress_review' => true]);
                $id = wp_insert_user(['user_login' => 'fp_' . substr(hash('sha256', $email), 0, 32), 'user_email' => $email, 'display_name' => $name, 'user_pass' => wp_generate_password(40, true, true), 'role' => 'feedbackpress_reviewer']);
                if (is_wp_error($id)) throw new \RuntimeException('Could not prepare your FeedbackPress account. Try again.', 503);
                $user = get_userdata($id);
            }
            if (is_multisite() && !is_user_member_of_blog($user->ID)) {
                if (!get_role('feedbackpress_reviewer')) add_role('feedbackpress_reviewer', 'FeedbackPress reviewer', ['feedbackpress_review' => true]);
                $result = add_user_to_blog(get_current_blog_id(), $user->ID, 'feedbackpress_reviewer');
                if (is_wp_error($result)) throw new \RuntimeException('Could not connect your FeedbackPress account.', 503);
            }
            $projects = array_values(array_filter((array) get_user_meta($user->ID, 'feedbackpress_projects', true), 'is_string'));
            $projects = array_values(array_filter($projects));
            if (!in_array($c['project'], $projects, true)) { $projects[] = $c['project']; update_user_meta($user->ID, 'feedbackpress_projects', $projects); }
        });
    }
    public static function link(): array {
        if (!current_user_can('manage_options')) throw new \RuntimeException('Administrator access required.', 403);
        if (settings()['mode'] === 'disabled') throw new \RuntimeException('Enable review access before copying a link.', 403);
        $link = Service::request('GET', '/share-link');
        $url = wp_parse_url($link['url'] ?? ''); $host = strtolower(rtrim(trim($url['host'] ?? '', '[]'), '.'));
        $ip = filter_var($host, FILTER_VALIDATE_IP);
        if (($url['scheme'] ?? '') !== 'https' || isset($url['user']) || isset($url['pass']) || !str_contains($host, '.') && !$ip
            || preg_match('/(^|\.)(localhost|local|test|invalid|lan|internal|home|localdomain)$/', $host) || str_ends_with($host, '.home.arpa')
            || ($ip && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))
            || !preg_match('/^fp-review=[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/D', $url['fragment'] ?? '')) throw new \RuntimeException('Connect a public HTTPS site before sharing links.', 409);
        return $link;
    }
    public static function ticketLink(string $id): array {
        if (!current_user_can('manage_options') || settings()['mode'] === 'disabled') throw new \RuntimeException('Administrator review access required.', 403);
        if (!Service::uuid($id)) throw new \InvalidArgumentException('Choose a valid issue.');
        $issue = Service::request('GET', '/issues/' . $id);
        if (($issue['visibility'] ?? 'shared') === 'private') throw new \RuntimeException('Private issues cannot be shared with a magic link.', 403);
        $path = $issue['path']; $link = self::link()['url'];
        if (!str_starts_with($path, '/') || str_starts_with($path, '//') || str_contains($path, '#') || !str_contains($link, '/#fp-review=')) throw new \RuntimeException('Could not create a link for this issue.', 409);
        return ['url' => strstr($link, '/#fp-review=', true) . $path . '#' . wp_parse_url($link, PHP_URL_FRAGMENT) . '&fp-return=' . rawurlencode('feedbackpress=' . $id)];
    }
    private static function cookies(string $token, int $expires): void {
        $path = rtrim((string) wp_parse_url(home_url(), PHP_URL_PATH), '/') . '/';
        foreach ([self::COOKIE => $token, self::FLAG => $token ? '1' : ''] as $key => $value) {
            setcookie($key, $value, ['expires' => $expires, 'path' => $path, 'secure' => true, 'httponly' => $key === self::COOKIE, 'samesite' => 'Lax']);
            if ($value) $_COOKIE[$key] = $value; else unset($_COOKIE[$key]);
        }
    }
    private static function same_origin($r) {
        $home = wp_parse_url(Service::home()); $origin = $home['scheme'] . '://' . $home['host'] . (isset($home['port']) ? ':' . $home['port'] : '');
        return ($r->get_header('origin') && $r->get_header('origin') !== $origin) || ($r->get_method() !== 'GET' && $r->get_header('origin') !== $origin) ? API::error('Open the review link on this site.', 403) : true;
    }
    public static function routes(callable $route): void {
        $admin = fn() => current_user_can('manage_options') ? true : API::error('Administrator access required.', 403);
        $route('/admin/review-link', 'GET', fn() => self::link(), $admin);
        $route('/admin/environments', 'GET', function ($r) {
            $allowed = API::read($r); if (is_wp_error($allowed)) return $allowed;
            $connection = Service::connection();
            if ((Service::request('GET', '/review-access', connection: $connection)['account_owner'] ?? false) !== true) throw new \RuntimeException('Only the FeedbackPress account owner can view environments.', 403);
            return Service::request('GET', '/environment-links', connection: $connection);
        }, $admin);
        $route('/admin/reviewers', 'GET', fn() => ['users' => array_map(fn($user) => ['id' => (int) $user->ID, 'name' => $user->display_name, 'email' => $user->user_email], get_users(['blog_id' => get_current_blog_id(), 'fields' => ['ID', 'display_name', 'user_email'], 'orderby' => 'display_name']))], $admin);
        $route('/admin/invite', 'POST', function ($r) {
            if (settings()['mode'] === 'disabled') throw new \RuntimeException('Enable review access before inviting a reviewer.', 403);
            if ($r->get_param('project') !== (Service::connection()['project'] ?? null)) throw new \RuntimeException('The project changed. Reload before sending an invitation.', 409);
            $userId = (int) $r->get_param('user_id'); $recipient = $userId ? get_userdata($userId) : null;
            if ($userId && (!$recipient || !is_user_member_of_blog($userId))) throw new \InvalidArgumentException('Choose a user on this site.');
            $email = $recipient ? $recipient->user_email : (string) $r->get_param('email');
            return Service::request('POST', '/invitations', ['email' => $email, 'name' => $recipient ? $recipient->display_name : strstr($email, '@', true), 'issued_at' => $r->get_param('issued_at')], API::key($r), true);
        }, $admin);
        $route('/issues/(?P<id>[a-f0-9-]{36})/review-link', 'GET', fn($r) => self::ticketLink($r['id']), $admin);
        $route('/review-session', ['GET', 'POST', 'DELETE'], function ($r) {
            if ($r->get_method() === 'DELETE') { self::cookies('', time() - 3600); return ['ended' => true]; }
            if ($r->get_method() === 'POST' && !(is_user_logged_in() && API::can_view())) {
                $key = 'fp_link_rate_' . hash_hmac('sha256', sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'] ?? 'unknown')), wp_salt()); $count = (int) get_transient($key);
                if ($count >= 30) throw new \RuntimeException('Too many review-link attempts. Try again in 15 minutes.', 429);
                set_transient($key, $count + 1, 900);
                self::$checked = [];
                $token = $r->get_param('token'); $grant = is_string($token) ? self::grant($token) : null;
                if (!$grant) throw new \RuntimeException('This review link is invalid for this site connection. Ask the site administrator for the current link.', 403);
                if ($r->get_param('invitation')) self::inviteAccount((string) $r->get_param('invitation'));
                if ($r->get_param('verification')) Email_Verification::accept((string) $r->get_param('verification'), $grant['token']);
                $remembered = $r->get_param('verification') || Email_Verification::current();
                self::cookies($grant['token'], time() + ($remembered ? 180 : 30) * DAY_IN_SECONDS);
            }
            if (!API::can_view()) { self::cookies('', time() - 3600); throw new \RuntimeException('Review access has ended. Ask the site administrator for a new link.', 403); }
            return ['config' => frontend_config(), 'script' => plugins_url('assets/review.js', dirname(__DIR__) . '/feedbackpress.php') . '?ver=' . asset_version(), 'capture' => plugins_url('assets/vendor/html2canvas-pro.min.js', dirname(__DIR__) . '/feedbackpress.php') . '?ver=2.6.3'];
        }, fn($r) => self::same_origin($r));
    }
}
