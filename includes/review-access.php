<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;

final class ReviewAccess {
    const COOKIE = '__Secure-feedbackpress-review';
    const FLAG = 'feedbackpress_review_active';
    public static function grant(?string $token = null, ?array $connection = null): ?array {
        $token = $token ?? ($_COOKIE[self::COOKIE] ?? '');
        if (settings()['mode'] === 'disabled' || !is_string($token) || !preg_match('/^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/D', $token, $match)) return null;
        $c = $connection ?? Service::connection();
        if (empty($c['token']) || empty($c['project']) || !empty($c['disconnected']) || ($c['site_url'] ?? '') !== Service::home() || wp_parse_url(Service::home(), PHP_URL_SCHEME) !== 'https' || ($c['credential_id'] ?? '') !== $match[1]) return null;
        $message = implode("\n", ['feedbackpress-review-v1', $c['project'], $c['site_url'], $c['credential_id']]);
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $message, hash('sha256', $c['token']), true)), '+/', '-_'), '=');
        return hash_equals($expected, $match[2]) ? ['authorized' => true] : null;
    }
    public static function link(): array {
        if (!current_user_can('manage_options')) throw new \RuntimeException('Administrator access required.', 403);
        if (settings()['mode'] === 'disabled') throw new \RuntimeException('Enable review access before copying a link.', 403);
        return Service::request('GET', '/review-link');
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
        $route('/review-session', ['GET', 'POST', 'DELETE'], function ($r) {
            if ($r->get_method() === 'DELETE') { self::cookies('', time() - 3600); return ['ended' => true]; }
            if ($r->get_method() === 'POST') {
                $key = 'fp_link_rate_' . hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', wp_salt()); $count = (int) get_transient($key);
                if ($count >= 30) throw new \RuntimeException('Too many review-link attempts. Try again in 15 minutes.', 429);
                set_transient($key, $count + 1, 900);
                $token = $r->get_param('token'); $grant = is_string($token) ? self::grant($token) : null;
                if (!$grant) throw new \RuntimeException('This review link is invalid for this site connection. Ask the site administrator for the current link.', 403);
                self::cookies($token, time() + 30 * DAY_IN_SECONDS);
            }
            if (!self::grant() && !(is_user_logged_in() && API::can_view())) { self::cookies('', time() - 3600); throw new \RuntimeException('Review access has ended. Ask the site administrator for a new link.', 403); }
            return ['config' => frontend_config(), 'script' => plugins_url('assets/review.js', dirname(__DIR__) . '/feedbackpress.php') . '?ver=' . asset_version(), 'capture' => plugins_url('assets/vendor/html2canvas-pro.min.js', dirname(__DIR__) . '/feedbackpress.php') . '?ver=2.6.3'];
        }, fn($r) => self::same_origin($r));
    }
}
