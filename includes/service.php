<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
/** Server-side central API gateway. No feedback or media is persisted in WordPress. */
final class Service {
    const OPTION = 'feedbackpress_connection_v2';
    public static function pack(array $value): string { return rtrim(strtr(base64_encode(wp_json_encode($value)), '+/', '-_'), '='); }
    public static function unpack(string $value): array { $raw = base64_decode(strtr($value, '-_', '+/'), true); $data = $raw === false ? null : json_decode($raw, true); return is_array($data) ? $data : []; }
    public static function connection(): array { return self::unpack((string) get_option(self::OPTION, '')); }
    public static function origin(string $value): string {
        $value = untrailingslashit(trim($value)); $p = wp_parse_url($value);
        if (!$p || !isset($p['scheme'], $p['host']) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment']) || !empty($p['path'])) throw new \InvalidArgumentException('Enter a service origin without a path or credentials.');
        $local = defined('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE') && FEEDBACKPRESS_ALLOW_LOCAL_SERVICE && $p['host'] === '127.0.0.1' && $p['scheme'] === 'http';
        if ($p['scheme'] !== 'https' && !$local) throw new \InvalidArgumentException('The service must use HTTPS.');
        return $value;
    }
    public static function connect(string $code): array {
        if (!str_starts_with(trim($code), 'fp2:')) throw new \InvalidArgumentException('Paste a FeedbackPress project connection code.');
        $c = self::unpack(substr(trim($code), 4));
        if (($c['v'] ?? 0) !== 2 || !self::uuid($c['project'] ?? '') || !preg_match('/^fp_[A-Za-z0-9_-]{43}$/D', $c['token'] ?? '')) throw new \InvalidArgumentException('The project connection code is invalid.');
        $c = ['v' => 2, 'service' => self::origin($c['service'] ?? ''), 'project' => $c['project'], 'token' => $c['token']];
        $project = self::request('GET', '', null, '', false, $c);
        $c['name'] = $project['name'];
        self::request('POST', '/sites', ['url' => untrailingslashit(home_url())], '', false, $c);
        update_option(self::OPTION, self::pack($c), false);
        wp_clear_scheduled_hook('feedbackpress_tick');
        delete_transient('feedbackpress_activity_v2');
        return ['id' => $c['project'], 'name' => $c['name']];
    }
    public static function uuid($id): bool { return is_string($id) && (bool) preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/Di', $id); }
    public static function request(string $method, string $path, $body = null, string $key = '', bool $actor = false, ?array $connection = null, bool $raw = false) {
        $c = $connection ?? self::connection();
        if (empty($c['token']) || empty($c['project'])) throw new \RuntimeException('Connect this installation to a project in Settings → FeedbackPress.', 503);
        $url = self::origin($c['service']) . '/v1/projects/' . $c['project'] . $path;
        return self::http($method, $url, $c['token'], $body, $key, $actor, $raw);
    }
    public static function http(string $method, string $url, string $token, $body = null, string $key = '', bool $actor = false, bool $raw = false) {
        $headers = ['Authorization' => 'Bearer ' . $token, 'Accept' => 'application/json'];
        if ($key) $headers['Idempotency-Key'] = $key;
        if ($actor) {
            if (!is_user_logged_in()) throw new \RuntimeException('Log in to WordPress to access private notes.', 403);
            $u = wp_get_current_user(); $headers['X-FeedbackPress-Actor'] = self::pack(['email' => strtolower(trim($u->user_email)), 'name' => $u->display_name]);
        }
        if ($body !== null) $headers['Content-Type'] = $method === 'PUT' ? (new \finfo(FILEINFO_MIME_TYPE))->buffer($body) : 'application/json';
        $start = microtime(true);
        $r = wp_remote_request($url, ['method' => $method, 'timeout' => 25, 'redirection' => 0, 'sslverify' => true, 'user-agent' => 'FeedbackPress/' . VERSION . '; WordPress gateway', 'headers' => $headers, 'body' => $body === null ? null : ($method === 'PUT' ? $body : wp_json_encode($body)), 'limit_response_size' => 20 * 1024 * 1024]);
        $status = is_wp_error($r) ? 0 : wp_remote_retrieve_response_code($r);
        Log::add(['operation' => $method, 'status' => $status, 'ms' => (int) ((microtime(true) - $start) * 1000), 'error' => is_wp_error($r) ? 'connection_failed' : '']);
        if (is_wp_error($r)) throw new \RuntimeException('Cannot reach the FeedbackPress service. Your unsaved changes are still here; try again.', 503);
        $bytes = wp_remote_retrieve_body($r);
        if ($status < 200 || $status >= 300) {
            $data = json_decode($bytes, true); $code = $data['error'] ?? 'service_error';
            $messages = ['idempotency_conflict' => 'This request was already saved with different content. Check the issue list before submitting another change.', 'stale_revision' => 'This issue changed elsewhere. Reopen it before saving.', 'account_inactive' => 'This FeedbackPress account is inactive.', 'quota_exceeded' => 'The account storage allowance is full. Your text is saved.', 'unauthorized' => 'The project connection is no longer authorized. Reconnect in Settings → FeedbackPress.', 'not_found' => 'The requested issue or file was not found.', 'media_missing' => 'The screenshot or attachment is temporarily unavailable. Try again.', 'wordpress_login_required' => 'Log in to WordPress to access private notes.'];
            throw new \RuntimeException($messages[$code] ?? ('FeedbackPress request failed (' . $status . ', ' . sanitize_key($code) . ').'), $status);
        }
        if ($raw) return ['body' => $bytes, 'mime' => wp_remote_retrieve_header($r, 'content-type'), 'disposition' => wp_remote_retrieve_header($r, 'content-disposition')];
        $data = json_decode($bytes, true);
        if (!is_array($data)) throw new \RuntimeException('The service returned an incomplete response. Try again.', 503);
        return $data;
    }
    public static function snapshot(): array {
        $issues = []; $offset = 0;
        do {
            $page = self::request('GET', '/snapshot?offset=' . $offset);
            foreach ($page['issues'] as $issue) $issues[] = self::view($issue);
            $offset = $page['next_offset'];
            if (count($issues) > 10000) throw new \RuntimeException('This project exceeds the current list limit.', 503);
        } while ($offset !== null);
        return ['issues' => $issues, 'cursor' => (string) $page['cursor']];
    }
    public static function person(array $p): array {
        $id = $p['id'] ?? Identity::id($p['email'] ?? '');
        $users = Identity::users();
        return ['author' => $users[$id]['name'] ?? $p['name'], 'author_id' => $id];
    }
    public static function view(array $i): array {
        $comments = $i['comments']; $root = null; $activity = [];
        foreach ($comments as $comment) {
            $p = self::person($comment['author']) + ['body' => $comment['body'], 'edit_revision' => (string) $i['revision'], 'edited_at' => $comment['edited_at']];
            if ($comment['id'] === $i['id']) $root = $p;
            else $activity[] = ['id' => $comment['id'], 'kind' => 'reply', 'created_at' => $comment['created_at'], 'payload' => $p];
        }
        if (!$root) throw new \RuntimeException('The issue response is incomplete.', 503);
        $files = array_map(fn($m) => ['id' => $m['id'], 'comment_id' => $m['comment_id'], 'name' => $m['name'], 'mime' => $m['mime'], 'size' => $m['size'], 'screenshot' => $m['screenshot'], 'available' => $m['state'] === 'ready', 'expired' => $m['state'] === 'expired'], $i['media']);
        return $root + array_intersect_key($i, array_flip(['id', 'number', 'title', 'path', 'target', 'status', 'created_at', 'updated_at', 'completed_at'])) + ['revision' => (string) $i['revision'], 'target_revision' => (string) $i['revision'], 'author_revision' => (string) $i['revision'], 'activity' => $activity, 'files' => $files, 'conflict' => false, 'author_conflict' => false, 'edit_conflict' => false];
    }
}
