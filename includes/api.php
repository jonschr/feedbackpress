<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class API {
    const MAX_FILE = 5242880;
    const STATUSES = ['todo', 'doing', 'review', 'done'];
    public static function error(string $message, int $status = 400): \WP_Error { return new \WP_Error('feedbackpress', $message, ['status' => $status]); }
    public static function can_view(): bool {
        if (!bound()) return false;
        $mode = settings()['mode'] ?? 'disabled';
        return $mode === 'everyone' || ($mode === 'admins' && current_user_can('manage_options'));
    }
    public static function key(\WP_REST_Request $r): bool {
        $secret = settings()['secret'] ?? '';
        return strlen($secret) >= 64 && hash_equals($secret, (string) $r->get_header('x-feedbackpress-key'));
    }
    public static function read(\WP_REST_Request $r) { return self::key($r) || self::can_view() ? true : self::error('Feedback is private.', 403); }
    public static function write(\WP_REST_Request $r) {
        if (self::key($r)) return true;
        if ($r->get_header('x-feedbackpress-network') && !hash_equals(settings()['project'], (string) $r->get_header('x-feedbackpress-network'))) return self::error('The network changed. Reload before submitting feedback.', 409);
        if (!self::can_view() || !bound()) return self::error('Feedback is unavailable.', 403);
        // Application Passwords authenticate administrators without a browser nonce.
        if (current_user_can('manage_options') && !$r->get_header('origin')) return true;
        $origin = $r->get_header('origin');
        $home = wp_parse_url(home_url());
        $expected = $home['scheme'] . '://' . $home['host'] . (isset($home['port']) ? ':' . $home['port'] : '');
        if (($origin && $origin !== $expected) || !wp_verify_nonce($r->get_header('x-wp-nonce'), 'wp_rest')) return self::error('Refresh the page before submitting feedback.', 403);
        $key = 'fp_rate_' . hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', wp_salt());
        $count = (int) get_transient($key);
        if ($count >= 100) return self::error('Too many requests. Try again in ten minutes.', 429);
        set_transient($key, $count + 1, 600);
        return true;
    }
    public static function hosting_auth(bool $is_api): bool {
        $route = $GLOBALS['wp']->query_vars['rest_route'] ?? ($_GET['rest_route'] ?? '');
        $path = wp_parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
        if (!is_string($route)) return $is_api;
        if (!str_starts_with($route, '/feedbackpress/v1/')) {
            $prefix = '/' . rest_get_url_prefix() . '/feedbackpress/v1/';
            $offset = strpos($path, $prefix);
            if ($offset === false) return $is_api;
            $route = '/feedbackpress/v1/' . substr($path, $offset + strlen($prefix));
        }
        // Hosting Basic Auth is not a WordPress Application Password when plugin credentials are supplied.
        $plugin_auth = isset($_SERVER['HTTP_X_FEEDBACKPRESS_NETWORK']) || isset($_SERVER['HTTP_X_FEEDBACKPRESS_KEY']) || isset($_SERVER['HTTP_X_WP_NONCE']);
        return $plugin_auth || rtrim($route, '/') === '/feedbackpress/v1/network/join' ? false : $is_api;
    }
    public static function routes(): void {
        $route = function ($path, $method, $callback, $permission) {
            register_rest_route('feedbackpress/v1', $path, ['methods' => $method, 'callback' => $callback, 'permission_callback' => $permission]);
        };
        $route('/sync/exchange', 'POST', [Sync::class, 'exchange'], [Network::class, 'exchange_permission']);
        $route('/sync/log', 'GET', function () { return Log::entries(); }, [Network::class, 'admin']);
        $route('/sync/activity', 'POST', [Sync::class, 'activity'], function ($r) { return Network::admin($r) === true ? true : self::write($r); });
        $route('/network/join', 'POST', [Network::class, 'accept_join'], '__return_true');
        $route('/network/code', 'POST', function ($r) { try { return ['code' => $r->get_param('provision') ? Network::provision((string) $r->get_param('provision')) : Network::export()]; } catch (\Throwable $e) { return self::error($e->getMessage()); } }, [Network::class, 'admin']);
        $route('/network/invite', 'POST', function () { try { return Network::issue_invite(); } catch (\Throwable $e) { return self::error($e->getMessage()); } }, function ($r) { return Network::admin($r) === true || Network::authenticate($r) === true ? true : self::error('Network administrator access required.', 403); });
        $route('/issues/(?P<id>[a-f0-9-]{36})/target', 'POST', [self::class, 'move'], [self::class, 'write']);
        $route('/identity', 'POST', function ($r) { try { return Identity::request($r); } catch (\InvalidArgumentException $e) { return self::error($e->getMessage()); } }, [self::class, 'write']);
        $route('/issues/(?P<id>[a-f0-9-]{36})/comments/(?P<comment_id>[a-f0-9-]{36})', 'POST', [Comments::class, 'edit'], [self::class, 'write']);
        $route('/authors', 'GET', fn() => Identity::people(), [self::class, 'read']);
        $route('/authors', 'POST', [Identity::class, 'register'], [self::class, 'write']);
        $route('/issues/(?P<id>[a-f0-9-]{36})/author', 'POST', [Identity::class, 'assign'], [self::class, 'write']);
        $route('/issues', 'GET', [self::class, 'listing'], [self::class, 'read']);
        $route('/issues', 'POST', [self::class, 'create'], [self::class, 'write']);
        $route('/issues/(?P<id>[a-f0-9-]{36})', 'GET', function ($r) { return Store::issue($r['id']) ?: self::error('Issue not found.', 404); }, [self::class, 'read']);
        $route('/issues/(?P<id>[a-f0-9-]{36})/status', 'POST', [self::class, 'status'], [self::class, 'write']);
        $route('/issues/(?P<id>[a-f0-9-]{36})/replies', 'POST', [self::class, 'reply'], [self::class, 'write']);
        $route('/issues/(?P<id>[a-f0-9-]{36})/files', 'POST', [self::class, 'upload'], [self::class, 'write']);
        $route('/files/(?P<id>[a-f0-9-]{36})', 'GET', [self::class, 'download'], [self::class, 'read']);
        $route('/sync/files/(?P<id>[a-f0-9-]{36})', 'GET', [Sync::class, 'get_file'], [Sync::class, 'permission']);
        $route('/sync/files/(?P<id>[a-f0-9-]{36})', 'POST', [Sync::class, 'put_file'], [Sync::class, 'permission']);
        add_filter('rest_post_dispatch', function ($response, $server, $r) {
            if (str_starts_with($r->get_route(), '/feedbackpress/')) $response->header('Cache-Control', 'private, no-store, max-age=0');
            return $response;
        }, 10, 3);
    }
    public static function listing(\WP_REST_Request $r): array {
        $search = is_string($r->get_param('search')) ? trim(sanitize_text_field($r->get_param('search'))) : '';
        $terms = preg_split('/\s+/u', $search, -1, PREG_SPLIT_NO_EMPTY);
        $issues = array_filter(Store::issues(), function ($i) use ($r, $terms) {
            if (($r->get_param('path') && $i['path'] !== $r->get_param('path')) || ($r->get_param('status') && !in_array($i['status'], explode(',', $r->get_param('status')), true))) return false;
            $text = $i['title'] . "\n" . $i['body'];
            foreach ($i['activity'] as $event) if ($event['kind'] === 'reply') $text .= "\n" . $event['payload']['body'];
            foreach ($terms as $term) if (!preg_match('/' . preg_quote($term, '/') . '/iu', $text)) return false;
            return true;
        });
        $order = in_array($r->get_param('order'), ['page', 'number', 'completed', 'updated'], true) ? $r->get_param('order') : 'number';
        usort($issues, function ($a, $b) use ($order) {
            if (in_array($order, ['completed', 'updated'], true)) {
                $date_order = strcmp($b[$order . '_at'] ?? '', $a[$order . '_at'] ?? '');
                if ($date_order) return $date_order;
            }
            $page_order = $order === 'page' ? strnatcasecmp($a['path'], $b['path']) : 0;
            return $page_order ?: strnatcasecmp($a['number'], $b['number']) ?: strcmp($a['id'], $b['id']);
        });
        $page = max(1, min((int) $r->get_param('page'), max(1, (int) ceil(count($issues) / 50))));
        if ($r->get_param('focus')) foreach ($issues as $index => $issue) {
            if ($issue['id'] === $r->get_param('focus')) { $page = (int) floor($index / 50) + 1; break; }
        }
        return ['issues' => array_slice($issues, ($page - 1) * 50, 50), 'total' => count($issues), 'page' => $page, 'order' => $order];
    }

    public static function author(\WP_REST_Request $r): string {
        if (is_user_logged_in() && !self::key($r)) return sanitize_text_field(wp_get_current_user()->display_name);
        return is_string($r->get_param('author')) ? sanitize_text_field($r->get_param('author')) : '';
    }
    public static function create(\WP_REST_Request $r) {
        try { $person = Identity::request($r); } catch (\InvalidArgumentException $e) { return self::error($e->getMessage()); }
        $author = $person['author']; $body = sanitize_textarea_field(is_string($r->get_param('body')) ? $r->get_param('body') : '');
        $title = $r->get_param('title') === null ? Store::title($body) : (is_string($r->get_param('title')) ? sanitize_text_field($r->get_param('title')) : '');
        if (!preg_match('/^.{1,120}$/usD', $title)) return self::error('Enter an issue title of up to 120 characters.');
        $path = is_string($r->get_param('path')) ? $r->get_param('path') : ''; $target = $r->get_param('target');
        if (!$author || strlen($author) > 120 || !$body || strlen($body) > 10000) return self::error('Enter your name and a comment (up to 10,000 characters).');
        if (!self::valid_path($path) || !is_array($target) || !is_string($target['selector'] ?? '') || !is_string($target['text'] ?? '') || !is_numeric($target['x'] ?? .5) || !is_numeric($target['y'] ?? .5)) return self::error('Invalid page or element.');
        $target = ['selector' => substr(sanitize_text_field((string) ($target['selector'] ?? '')), 0, 2000), 'text' => substr(sanitize_text_field((string) ($target['text'] ?? '')), 0, 240), 'x' => max(0, min(1, (float) ($target['x'] ?? .5))), 'y' => max(0, min(1, (float) ($target['y'] ?? .5)))];
        $status = $r->get_param('status') ?? 'todo';
        if (!in_array($status, self::STATUSES, true)) return self::error('Choose a valid initial status.');
        $id = wp_generate_uuid4();
        Store::append($id, 'issue', array_merge($person, ['status' => $status, 'title' => $title, 'body' => $body, 'path' => $path, 'target' => $target, 'context' => ['viewport' => substr(sanitize_text_field(is_string($r->get_param('viewport')) ? $r->get_param('viewport') : ''), 0, 40), 'browser' => substr(sanitize_text_field((string) $r->get_header('user-agent')), 0, 300)]]));
        return new \WP_REST_Response(Store::issue($id), 201);
    }
    public static function valid_path($path): bool { return is_string($path) && strlen($path) <= 2000 && str_starts_with($path, '/') && !str_starts_with($path, '//') && !preg_match('/[?#\\\\\x00-\x20]/', $path); }
    public static function valid_target($target): bool {
        return is_array($target) && is_string($target['selector'] ?? null) && strlen($target['selector']) > 0 && strlen($target['selector']) <= 2000 && is_string($target['text'] ?? null) && strlen($target['text']) <= 960 && is_numeric($target['x'] ?? null) && is_numeric($target['y'] ?? null) && $target['x'] >= 0 && $target['x'] <= 1 && $target['y'] >= 0 && $target['y'] <= 1;
    }
    public static function move(\WP_REST_Request $r) {
        $issue = Store::issue($r['id']);
        if (!$issue) return self::error('Issue not found.', 404);
        if (!is_string($r->get_param('revision')) || !hash_equals($issue['target_revision'], $r->get_param('revision'))) return self::error('The pin moved elsewhere. Reopen the issue and try again.', 409);
        $target = $r->get_param('target'); $author = self::author($r);
        if (!self::valid_target($target) || !$author || strlen($author) > 120) return self::error('Choose a page element and identify yourself before moving the pin.');
        Store::append($issue['id'], 'target', ['target' => array_intersect_key($target, array_flip(['selector', 'text', 'x', 'y'])), 'parents' => $issue['target_heads'], 'author' => $author]);
        return Store::issue($issue['id']);
    }
    public static function status(\WP_REST_Request $r) {
        $issue = Store::issue($r['id']);
        if (!$issue) return self::error('Issue not found.', 404);
        if (!self::author($r) || strlen(self::author($r)) > 120 || !in_array($r->get_param('status'), self::STATUSES, true)) return self::error('A name and valid status are required.');
        if ($r->get_param('revision') !== $issue['revision']) return self::error('This issue changed. Reload it before changing its status.', 409);
        Store::append($r['id'], 'status', ['author' => self::author($r), 'status' => $r->get_param('status'), 'parents' => $issue['heads']]);
        return Store::issue($r['id']);
    }
    public static function reply(\WP_REST_Request $r) {
        if (!Store::issue($r['id'])) return self::error('Issue not found.', 404);
        try { $person = Identity::request($r); } catch (\InvalidArgumentException $e) { return self::error($e->getMessage()); }
        $body = sanitize_textarea_field(is_string($r->get_param('body')) ? $r->get_param('body') : '');
        if (!$person['author'] || strlen($person['author']) > 120 || !$body || strlen($body) > 10000) return self::error('Enter your name and reply (up to 10,000 characters).');
        $event = Store::append($r['id'], 'reply', $person + ['body' => $body]);
        return array_merge(Store::issue($r['id']), ['reply_id' => $event['id']]);
    }
    public static function upload(\WP_REST_Request $r) {
        if (!Store::issue($r['id'])) return self::error('Issue not found.', 404);
        $comment = $r->get_param('comment_id') ?? $r['id'];
        if (!Store::uuid($comment)) return self::error('Invalid comment reference.');
        if ($comment !== $r['id']) {
            $found = false;
            foreach (Store::events($r['id']) as $event) if ($event['kind'] === 'reply' && $event['id'] === $comment) { $found = true; break; }
            if (!$found) return self::error('The attachment must belong to a comment on this issue.');
        }
        $file = $r->get_file_params()['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > self::MAX_FILE || !is_uploaded_file($file['tmp_name'])) return self::error('Upload an image or PDF no larger than 5 MB.');
        $bytes = file_get_contents($file['tmp_name']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (!self::valid_file($bytes, $mime)) return self::error('Only PNG, JPEG, WebP, GIF images and PDFs are accepted.');
        $event = Store::append($r['id'], 'file', ['name' => substr(sanitize_file_name($file['name']), 0, 160), 'mime' => $mime, 'size' => strlen($bytes), 'sha256' => hash('sha256', $bytes), 'expires_at' => time() + DAY_IN_SECONDS * (int) settings()['retention'], 'screenshot' => $r->get_param('screenshot') === '1', 'comment_id' => $comment]);
        if (!Store::put_file($event['id'], $bytes)) return self::error('Could not store the attachment. Retry the upload.', 500);
        return Store::issue($r['id']);
    }
    public static function valid_file(string $bytes, string $mime): bool {
        if (!strlen($bytes) || strlen($bytes) > self::MAX_FILE) return false;
        if ($mime === 'application/pdf') return str_starts_with($bytes, '%PDF-');
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true)) return false;
        $image = @getimagesizefromstring($bytes);
        return $image && $image['mime'] === $mime && $image[0] * $image[1] <= 40000000;
    }
    public static function download(\WP_REST_Request $r) {
        $file = Store::live_file($r['id']); $path = Store::file_path($r['id']);
        if (!$file || !is_file($path)) return self::error('Attachment is expired or unavailable.', 404);
        header('Content-Type: ' . $file['mime']);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . sanitize_file_name($file['name']) . '"');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: sandbox; default-src 'none'");
        header('Cache-Control: private, no-store');
        readfile($path); exit;
    }
}
