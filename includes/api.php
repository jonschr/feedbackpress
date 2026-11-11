<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class API {
    const MAX_FILE = 5242880;
    const STATUSES = ['todo', 'doing', 'review', 'done'];
    public static function error(string $message, int $status = 400): \WP_Error { return new \WP_Error('feedbackpress', $message, ['status' => $status]); }
    public static function can_view(): bool { $m = settings()['mode']; if (!($m === 'everyone' || ($m === 'admins' && current_user_can('manage_options')))) return false; try { Service::ensureConnection(); } catch (\Throwable $e) { return false; } return bound(); }
    public static function read($r = null) { if ($r && $r->get_header('x-feedbackpress-network') && $r->get_header('x-feedbackpress-network') !== (Service::connection()['project'] ?? '')) return self::error('The project changed. Reload this page.', 409); return self::can_view() ? true : self::error('Feedback is unavailable.', 403); }
    public static function write(\WP_REST_Request $r) {
        if (!self::can_view()) return self::error('Feedback is unavailable.', 403);
        if ($r->get_header('x-feedbackpress-network') && $r->get_header('x-feedbackpress-network') !== (Service::connection()['project'] ?? '')) return self::error('The project changed. Reload before saving.', 409);
        if (current_user_can('manage_options') && !$r->get_header('origin')) return true;
        $home = wp_parse_url(home_url()); $expected = $home['scheme'] . '://' . $home['host'] . (isset($home['port']) ? ':' . $home['port'] : '');
        if (($r->get_header('origin') && $r->get_header('origin') !== $expected) || !wp_verify_nonce($r->get_header('x-wp-nonce'), 'wp_rest')) return self::error('Refresh the page before saving.', 403);
        $key = 'fp_rate_' . hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', wp_salt()); $count = (int) get_transient($key);
        if ($count >= 100) return self::error('Too many requests. Try again in ten minutes.', 429);
        set_transient($key, $count + 1, 600); return true;
    }
    public static function hosting_auth(bool $is_api): bool {
        $path = $_SERVER['REQUEST_URI'] ?? '';
        return str_contains($path, 'feedbackpress/v1/') && isset($_SERVER['HTTP_X_WP_NONCE']) ? false : $is_api;
    }
    public static function routes(): void {
        $route = function ($path, $methods, $callback, $permission = null) {
            register_rest_route('feedbackpress/v1', $path, ['methods' => $methods, 'permission_callback' => $permission ?? [self::class, 'write'], 'callback' => function ($r) use ($callback) {
                try { return $callback($r); } catch (\Throwable $e) { $status = (int) $e->getCode(); return self::error($e->getMessage(), $status >= 400 && $status <= 599 ? $status : 400); }
            }]);
        };
        $read = [self::class, 'read']; $id = '/issues/(?P<id>[a-f0-9-]{36})';
        $route('/issues', 'GET', [self::class, 'listing'], $read);
        $route('/issues', 'POST', function ($r) {
            $body = ['title' => $r->get_param('title'), 'body' => $r->get_param('body') ?? '', 'path' => $r->get_param('path'), 'target' => $r->get_param('target'), 'status' => $r->get_param('status') ?? 'todo', 'author' => Identity::request($r)];
            return Service::view(Service::request('POST', '/issues', $body, self::key($r)));
        });
        $route($id, 'GET', fn($r) => Service::view(Service::request('GET', '/issues/' . $r['id'])), $read);
        foreach (['status', 'target'] as $action) $route($id . '/' . $action, 'POST', fn($r) => Service::view(Service::request('PATCH', '/issues/' . $r['id'] . '/' . $action, ['revision' => (int) $r->get_param('revision'), $action => $r->get_param($action)], self::key($r))));
        $route($id . '/replies', 'POST', function ($r) {
            $raw = Service::request('POST', '/issues/' . $r['id'] . '/replies', ['revision' => (int) $r->get_param('revision'), 'body' => $r->get_param('body'), 'author' => Identity::request($r)], self::key($r));
            $reply = end($raw['comments']);
            return Service::view($raw) + ['reply_id' => $reply['id']];
        });
        $route($id . '/comments/(?P<comment_id>[a-f0-9-]{36})', 'POST', function ($r) {
            $body = ['revision' => (int) $r->get_param('revision'), 'body' => $r->get_param('body'), 'author' => Identity::request($r)];
            if ($r->has_param('title')) $body['title'] = $r->get_param('title');
            return Service::view(Service::request('PATCH', '/issues/' . $r['id'] . '/comments/' . $r['comment_id'], $body, self::key($r)));
        });
        $route('/identity', 'POST', fn($r) => Service::person(Service::request('POST', '/people', Identity::request($r))));
        $route('/authors', 'GET', fn() => Identity::people(), $read);
        $route('/authors', 'POST', fn($r) => self::personResult(Service::request('POST', '/people', ['name' => $r->get_param('name'), 'email' => $r->get_param('email')])));
        $route($id . '/author', 'POST', function ($r) {
            $person = null;
            foreach (Service::request('GET', '/people') as $p) if ($p['id'] === $r->get_param('author_id')) $person = $p;
            // A WordPress user can be selected before their first comment.
            if (!$person) foreach (get_users(['fields' => ['display_name', 'user_email']]) as $u) if (Identity::id($u->user_email) === $r->get_param('author_id')) $person = ['name' => $u->display_name, 'email' => $u->user_email];
            if (!$person) throw new \InvalidArgumentException('Choose an author from the list.');
            return Service::view(Service::request('PATCH', '/issues/' . $r['id'] . '/authors/' . $r['id'], ['revision' => (int) $r->get_param('revision'), 'author' => $person], self::key($r)));
        });
        $route($id . '/files', 'POST', [self::class, 'upload']);
        $route('/files/(?P<id>[a-f0-9-]{36})', 'GET', function ($r) {
            $file = Service::request('GET', '/media/' . $r['id'], null, '', false, null, true);
            $response = new \WP_REST_Response(null); $response->header('Content-Type', $file['mime']); $response->header('Content-Disposition', $file['disposition']);
            $response->header('X-Content-Type-Options', 'nosniff'); $response->header('Content-Security-Policy', "sandbox; default-src 'none'");
            $response->header('X-FeedbackPress-Binary', '1'); $response->set_data($file['body']); return $response;
        }, $read);
        $route('/sync/activity', 'POST', function () {
            $since = get_transient('feedbackpress_activity_v2');
            if ($since !== false) return ['network' => Service::connection()['project'], 'cursor' => (string) $since, 'state' => 'throttled'];
            // Lock before network I/O to coalesce callers on this installation.
            if ((int) get_option('feedbackpress_activity_lock_v2', 0) < time()) delete_option('feedbackpress_activity_lock_v2');
            if (!add_option('feedbackpress_activity_lock_v2', time() + 60, '', false)) return ['state' => 'busy', 'network' => Service::connection()['project']];
            try {
                Service::request('POST', '/sites', ['url' => untrailingslashit(home_url())]);
                $data = Service::snapshot(); set_transient('feedbackpress_activity_v2', $data['cursor'] ?: '0', 60);
                return $data + ['network' => Service::connection()['project'], 'new_issues' => array_column($data['issues'], 'id')];
            } finally { delete_option('feedbackpress_activity_lock_v2'); }
        });
        $notes = $id . '/notes';
        $route($notes, 'GET', fn($r) => Service::request('GET', '/issues/' . $r['id'] . '/notes', null, '', true), fn() => self::privateRead());
        $route($notes, 'POST', fn($r) => Service::request('POST', '/issues/' . $r['id'] . '/notes', ['body' => $r->get_param('body'), 'kind' => $r->get_param('kind') ?? 'agent', 'agent' => $r->get_param('agent') ?? 'Agent'], self::key($r), true), fn($r) => self::privateWrite($r));
        $route($notes . '/(?P<note>[a-f0-9-]{36})(?P<convert>/convert)?', ['POST', 'DELETE'], function ($r) {
            $convert = (bool) $r->get_param('convert');
            $method = $convert ? 'POST' : ($r->get_method() === 'DELETE' ? 'DELETE' : 'PATCH');
            $body = ['revision' => (int) $r->get_param('revision')]; if ($r->has_param('body')) $body['body'] = $r->get_param('body');
            return Service::request($method, '/issues/' . $r['id'] . '/notes/' . $r['note'] . ($convert ? '/convert' : ''), $body, self::key($r), true);
        }, fn($r) => self::privateWrite($r));
        Admin::routes($route);
        add_filter('rest_post_dispatch', function ($response, $server, $r) { if (str_starts_with($r->get_route(), '/feedbackpress/')) { $response->header('Cache-Control', 'private, no-store, max-age=0'); $response->header('Vary', 'Cookie, Authorization'); } return $response; }, 10, 3);
        add_filter('rest_pre_serve_request', function ($served, $response, $request) {
            if (($response->get_headers()['X-FeedbackPress-Binary'] ?? '') === '1') { echo $response->get_data(); return true; } return $served;
        }, 10, 3);
    }
    public static function privateRead() { return is_user_logged_in() && self::can_view() ? true : self::error('Log in to WordPress to access private notes.', 403); }
    public static function privateWrite($r) { return self::privateRead() === true ? self::write($r) : self::privateRead(); }
    public static function key($r): string {
        $key = $r->get_header('idempotency-key');
        if (!Service::uuid($key)) throw new \InvalidArgumentException('A unique request ID is required. Reload the page and try again.');
        return $key;
    }
    public static function personResult(array $p): array { $person = Service::person($p); return ['id' => $person['author_id'], 'name' => $person['author']]; }
    public static function listing($r): array {
        $terms = preg_split('/\s+/u', trim((string) $r->get_param('search')), -1, PREG_SPLIT_NO_EMPTY);
        $issues = array_values(array_filter(Service::snapshot()['issues'], function ($i) use ($r, $terms) {
            if (($r->get_param('path') && $i['path'] !== $r->get_param('path')) || ($r->has_param('status') && !in_array($i['status'], explode(',', (string) $r->get_param('status')), true))) return false;
            $text = $i['title'] . "\n" . $i['body']; foreach ($i['activity'] as $e) $text .= "\n" . $e['payload']['body'];
            foreach ($terms as $term) if (!preg_match('/' . preg_quote($term, '/') . '/iu', $text)) return false;
            return true;
        }));
        $order = in_array($r->get_param('order'), ['page', 'completed', 'updated'], true) ? $r->get_param('order') : 'number';
        usort($issues, function ($a, $b) use ($order) {
            $value = in_array($order, ['completed', 'updated'], true) ? strcmp($b[$order . '_at'] ?? '', $a[$order . '_at'] ?? '') : ($order === 'page' ? strnatcasecmp($a['path'], $b['path']) : 0);
            return $value ?: ($a['number'] <=> $b['number']);
        });
        $page = max(1, min((int) $r->get_param('page'), max(1, (int) ceil(count($issues) / 50))));
        if ($r->get_param('focus')) foreach ($issues as $n => $issue) if ($issue['id'] === $r->get_param('focus')) { $page = (int) floor($n / 50) + 1; break; }
        return ['issues' => array_slice($issues, ($page - 1) * 50, 50), 'total' => count($issues), 'page' => $page, 'order' => $order];
    }
    public static function upload($r) {
        $file = $r->get_file_params()['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > self::MAX_FILE || !is_uploaded_file($file['tmp_name'])) throw new \InvalidArgumentException('Upload an image or PDF no larger than 5 MB.');
        $bytes = file_get_contents($file['tmp_name']); $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], true)) throw new \InvalidArgumentException('Only PNG, JPEG, WebP images and PDFs are accepted.');
        $reservation = Service::request('POST', '/media', ['issue_id' => $r['id'], 'comment_id' => $r->get_param('comment_id') ?: $r['id'], 'name' => sanitize_file_name($file['name']), 'mime' => $mime, 'size' => strlen($bytes), 'sha256' => hash('sha256', $bytes), 'screenshot' => $r->get_param('screenshot') === '1'], self::key($r));
        return Service::request('PUT', '/media/' . $reservation['id'], $bytes);
    }
}
