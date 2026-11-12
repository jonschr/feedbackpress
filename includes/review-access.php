<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;

final class ReviewAccess {
    const OPTION = 'feedbackpress_review_links';
    const COOKIE = '__Secure-feedbackpress-review';
    const FLAG = 'feedbackpress_review_active';
    private static function scope(?array $c = null): string {
        $c = $c ?? Service::connection();
        return hash_hmac('sha256', implode("\n", [Service::home(), $c['service'] ?? '', $c['project'] ?? '', $c['credential_id'] ?? '']), wp_salt('auth'));
    }
    private static function available(): bool {
        if (settings()['mode'] === 'disabled' || !bound() || wp_parse_url(Service::home(), PHP_URL_SCHEME) !== 'https') return false;
        try { Service::ensureConnection(); } catch (\Throwable $e) { return false; }
        return bound();
    }
    public static function grant(?string $token = null, ?array $connection = null): ?array {
        $token = $token ?? ($_COOKIE[self::COOKIE] ?? '');
        if (!is_string($token) || !preg_match('/^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/D', $token, $match) || !self::available()) return null;
        $grant = ((array) get_option(self::OPTION, []))[$match[1]] ?? null;
        return $grant && $grant['expires_at'] > time() && hash_equals($grant['scope'], self::scope($connection)) && hash_equals($grant['hash'], hash('sha256', $match[2])) ? $grant : null;
    }
    public static function can_share(): bool {
        return self::available() && (current_user_can('manage_options') || (settings()['link_sharing'] === 'everyone' && API::can_view()));
    }
    private static function locked(callable $work) {
        $lock = 'feedbackpress_review_links_lock';
        wp_cache_delete($lock, 'options');
        $old = get_option($lock, []); $owner = wp_generate_uuid4();
        if (($old['expires'] ?? 0) < time()) delete_option($lock);
        if (!add_option($lock, ['owner' => $owner, 'expires' => time() + 15], '', false)) throw new \RuntimeException('Review links are being updated. Try again.', 409);
        try { wp_cache_delete(self::OPTION, 'options'); return $work(); }
        finally { wp_cache_delete($lock, 'options'); if ((get_option($lock, [])['owner'] ?? '') === $owner) delete_option($lock); }
    }
    public static function listing(): array {
        $scope = self::scope();
        return array_values(array_map(fn($g) => array_intersect_key($g, array_flip(['id', 'label', 'created_at', 'expires_at'])), array_filter((array) get_option(self::OPTION, []), fn($g) => $g['expires_at'] > time() && hash_equals($g['scope'], $scope))));
    }
    public static function create($r): array {
        if (!self::available()) throw new \RuntimeException('Enable review access and connect this site over HTTPS before creating a link.', 403);
        $scope = self::scope(); $home = Service::home();
        if (!self::can_share()) throw new \RuntimeException('Administrator access is required to create review links.', 403);
        $days = (int) ($r->get_param('days') ?? 7);
        if (!in_array($days, [1, 7, 30], true)) throw new \InvalidArgumentException('Choose a link duration.');
        $label = sanitize_text_field((string) ($r->get_param('label') ?? 'Client review'));
        if (!$label || strlen($label) > 120) throw new \InvalidArgumentException('Use a label of 1–120 characters.');
        $path = (string) ($r->get_param('path') ?? '/');
        $pathname = rawurldecode(explode('?', explode('#', $path, 2)[0], 2)[0]);
        if (strlen($path) > 4096 || !str_starts_with($path, '/') || str_starts_with($path, '//') || preg_match('/[\\\\\x00-\x20]/', $path) || preg_match('~(^|/)\.{1,2}(/|$)~', $pathname)) throw new \InvalidArgumentException('Choose a page on this site.');
        return self::locked(function () use ($days, $label, $path, $scope, $home) {
            if (!hash_equals($scope, self::scope())) throw new \RuntimeException('The project connection changed. Reload before creating a link.', 409);
            $links = array_filter((array) get_option(self::OPTION, []), fn($g) => $g['expires_at'] > time() && hash_equals($g['scope'], $scope));
            if (count($links) >= 100) throw new \RuntimeException('Revoke an existing review link before creating another.', 409);
            $id = wp_generate_uuid4(); $secret = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $grant = ['id' => $id, 'label' => $label, 'created_at' => time(), 'expires_at' => time() + $days * DAY_IN_SECONDS, 'scope' => $scope, 'hash' => hash('sha256', $secret)];
            $links[$id] = $grant;
            if (!update_option(self::OPTION, $links, false)) throw new \RuntimeException('The review link could not be saved. Try again.', 503);
            $target = explode('#', $home . $path, 2);
            return ['id' => $id, 'url' => $target[0] . '#fp-review=' . $id . '.' . $secret . (isset($target[1]) ? '&fp-return=' . rawurlencode($target[1]) : ''), 'expires_at' => $grant['expires_at']];
        });
    }
    public static function revoke(string $id): array {
        return self::locked(function () use ($id) { $links = (array) get_option(self::OPTION, []); if (isset($links[$id])) { unset($links[$id]); if (!update_option(self::OPTION, $links, false)) throw new \RuntimeException('The review link could not be revoked. Try again.', 503); } return ['revoked' => true]; });
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
        $route('/admin/review-links', 'GET', fn() => self::listing(), $admin);
        $route('/admin/review-links', 'POST', fn($r) => self::create($r), $admin);
        $route('/admin/review-links/revoke', 'POST', fn($r) => self::revoke((string) $r->get_param('id')), $admin);
        $route('/review-links', 'POST', fn($r) => self::create($r), fn($r) => self::can_share() ? API::write($r) : API::error('Administrator access is required to create review links.', 403));
        $route('/review-session', ['GET', 'POST', 'DELETE'], function ($r) {
            if ($r->get_method() === 'DELETE') { self::cookies('', time() - 3600); return ['ended' => true]; }
            if ($r->get_method() === 'POST') {
                $key = 'fp_link_rate_' . hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', wp_salt()); $count = (int) get_transient($key);
                if ($count >= 30) throw new \RuntimeException('Too many review-link attempts. Try again in 15 minutes.', 429);
                set_transient($key, $count + 1, 900);
                $token = $r->get_param('token'); $grant = is_string($token) ? self::grant($token) : null;
                if (!$grant) throw new \RuntimeException('This review link is invalid, expired or revoked. Ask the site administrator for a new link.', 403);
                self::cookies($token, $grant['expires_at']);
            }
            if (!self::grant() && !(is_user_logged_in() && API::can_view())) { self::cookies('', time() - 3600); throw new \RuntimeException('Review access has ended. Ask the site administrator for a new link.', 403); }
            return ['config' => frontend_config(), 'script' => plugins_url('assets/review.js', dirname(__DIR__) . '/feedbackpress.php') . '?ver=' . asset_version(), 'capture' => plugins_url('assets/vendor/html2canvas-pro.min.js', dirname(__DIR__) . '/feedbackpress.php') . '?ver=2.6.3'];
        }, fn($r) => self::same_origin($r));
    }
}
