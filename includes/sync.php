<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Sync {
    public static function permission(\WP_REST_Request $r) {
        if (!bound() || !API::key($r) || !hash_equals(settings()['project'] ?? '', (string) $r->get_header('x-feedbackpress-project'))) return API::error('Invalid project credentials or unconfirmed environment.', 403);
        return true;
    }
    public static function validate($e): bool {
        if (!is_array($e) || !Store::uuid($e['id'] ?? null) || !Store::uuid($e['issue_id'] ?? null) || !in_array($e['environment'] ?? '', ['production', 'staging', 'local'], true) || !is_string($e['created_at'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $e['created_at']) || !is_array($e['payload'] ?? null)) return false;
        $p = $e['payload'];
        $text = fn($s, $n) => is_string($s) && strlen($s) > 0 && strlen($s) <= $n && sanitize_textarea_field($s) === $s;
        if (isset($p['number']) && (!is_string($p['number']) || !preg_match('/^[SP]?[1-9][0-9]{0,9}$/D', $p['number']))) return false;
        switch ($e['kind'] ?? '') {
            case 'number': return isset($p['number']);
            case 'issue':
                return $text($p['author'] ?? null, 120) && $text($p['body'] ?? null, 10000) && API::valid_path($p['path'] ?? null) && is_array($p['context'] ?? null) && is_array($p['target'] ?? null) && is_string($p['target']['selector'] ?? null) && strlen($p['target']['selector']) <= 2000 && is_string($p['target']['text'] ?? null) && strlen($p['target']['text']) <= 240 && is_numeric($p['target']['x'] ?? null) && is_numeric($p['target']['y'] ?? null);
            case 'reply': return $text($p['author'] ?? null, 120) && $text($p['body'] ?? null, 10000);
            case 'status':
                if (!$text($p['author'] ?? null, 120) || !in_array($p['status'] ?? '', API::STATUSES, true) || !is_array($p['parents'] ?? null) || !count($p['parents']) || count($p['parents']) > 100) return false;
                foreach ($p['parents'] as $id) if (!Store::uuid($id) || $id === $e['id']) return false;
                return true;
            case 'file': return (!isset($p['comment_id']) || Store::uuid($p['comment_id'])) && is_string($p['name'] ?? null) && strlen($p['name']) <= 160 && in_array($p['mime'] ?? '', ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'], true) && is_int($p['size'] ?? null) && $p['size'] > 0 && $p['size'] <= API::MAX_FILE && is_string($p['sha256'] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $p['sha256']) && is_int($p['expires_at'] ?? null) && is_bool($p['screenshot'] ?? null);
            case 'expire': return Store::uuid($p['file_id'] ?? null);
            case 'delete': return $text($p['author'] ?? null, 120);
        }
        return false;
    }
    public static function receive(\WP_REST_Request $r) {
        $events = $r->get_param('events');
        if (!is_array($events) || count($events) > 50 || strlen($r->get_body()) > 1000000) return API::error('Invalid event batch.');
        // Validate the entire batch before making any writes.
        foreach ($events as $e) if (!self::validate($e) || strlen(wp_json_encode($e)) > 20000) return API::error('Invalid feedback event.');
        foreach ($events as $e) Store::insert($e);
        Store::cleanup();
        return ['accepted' => count($events)];
    }
    public static function get_file(\WP_REST_Request $r) {
        if (!Store::live_file($r['id']) || !is_file(Store::file_path($r['id']))) return API::error('File unavailable.', 404);
        return ['data' => base64_encode(file_get_contents(Store::file_path($r['id'])))];
    }
    public static function put_file(\WP_REST_Request $r) {
        $data = $r->get_param('data');
        if (!is_string($data) || strlen($data) > 4 * ceil(API::MAX_FILE / 3)) return API::error('Invalid file size.');
        $bytes = base64_decode($data, true); $f = Store::live_file($r['id']);
        if (!$f) return ['skipped' => true]; // Expiration/deletion wins over a delayed transfer.
        if ($bytes === false || !API::valid_file($bytes, $f['mime']) || !Store::put_file($r['id'], $bytes)) return API::error('Invalid file or storage unavailable.');
        return ['stored' => true];
    }
    private static function request(string $base, string $path, ?array $body = null): array {
        $s = settings();
        $args = ['timeout' => 20, 'redirection' => 0, 'limit_response_size' => 8 * 1024 * 1024, 'headers' => ['X-FeedbackPress-Key' => $s['secret'], 'X-FeedbackPress-Project' => $s['project'], 'Content-Type' => 'application/json', 'User-Agent' => 'FeedbackPress/' . VERSION . '; ' . home_url()]];
        if ($body !== null) { $args['method'] = 'POST'; $args['body'] = wp_json_encode($body); }
        // Only administrator-configured peers are contacted; redirects cannot forward the secret.
        $response = wp_remote_request($base . '/?rest_route=/feedbackpress/v1/' . str_replace('?', '&', $path), $args);
        if (is_wp_error($response)) throw new \RuntimeException($response->get_error_message());
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) throw new \RuntimeException('Peer returned HTTP ' . $code . '. Check its URL, project ID, key, and environment confirmation.');
        $json = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($json)) throw new \RuntimeException('Peer returned an invalid response.');
        return $json;
    }
    public static function run(): array {
        if (!bound()) return ['error' => 'Confirm this installation’s environment in settings before syncing.'];
        // An option insert is atomic across overlapping cron and manual requests.
        $lock = (int) get_option('feedbackpress_sync_lock', 0);
        if ($lock && $lock < time() - 900) delete_option('feedbackpress_sync_lock');
        if (!add_option('feedbackpress_sync_lock', time(), '', false)) return ['error' => 'A sync is already running.'];
        $results = [];
        try {
            $s = settings();
            foreach (['production', 'staging', 'local'] as $env) {
                $base = untrailingslashit($s[$env]);
                if (!$base || $base === untrailingslashit(home_url()) || $env === $s['environment']) continue;
                // Public servers cannot normally reach local domains. Local initiates both directions.
                if ($env === 'local' && $s['environment'] !== 'local') continue;
                $cursor_key = 'feedbackpress_cursor_' . md5($s['project'] . $base);
                $cursor = get_option($cursor_key, ['pull' => 0, 'push' => 0]);
                try {
                    $pulled = 0; $pushed = 0;
                    for ($batch = 0; $batch < 5; $batch++) {
                        $events = self::request($base, 'sync/events?after=' . (int) $cursor['pull'])['events'] ?? null;
                        if (!is_array($events) || count($events) > 50) throw new \RuntimeException('Invalid event response.');
                        foreach ($events as $e) if (!self::validate($e) || !isset($e['seq']) || !is_numeric($e['seq'])) throw new \RuntimeException('Peer sent an invalid event.');
                        foreach ($events as $e) { Store::insert($e); $cursor['pull'] = max($cursor['pull'], (int) $e['seq']); $pulled++; }
                        update_option($cursor_key, $cursor, false);
                        if (count($events) < 50) break;
                    }
                    for ($batch = 0; $batch < 5; $batch++) {
                        $events = Store::page((int) $cursor['push']);
                        if (!$events) break;
                        self::request($base, 'sync/events', ['events' => $events]);
                        $cursor['push'] = (int) end($events)['seq']; $pushed += count($events);
                        update_option($cursor_key, $cursor, false);
                        if (count($events) < 50) break;
                    }
                    // Files retry independently of event cursors, including after a partial transfer.
                    $file_failures = 0;
                    foreach (Store::issues() as $issue) foreach ($issue['files'] as $file) {
                        if ($file['expired']) continue;
                        try {
                            if (!$file['available']) {
                                $data = self::request($base, 'sync/files/' . $file['id'])['data'] ?? '';
                                $bytes = is_string($data) ? base64_decode($data, true) : false;
                                if ($bytes === false || !API::valid_file($bytes, $file['mime']) || !Store::put_file($file['id'], $bytes)) throw new \RuntimeException('Attachment failed validation.');
                            } else {
                                $sent_key = 'feedbackpress_file_' . md5($base . $s['project'] . $file['id']);
                                if (!get_option($sent_key)) {
                                    $result = self::request($base, 'sync/files/' . $file['id'], ['data' => base64_encode(file_get_contents(Store::file_path($file['id'])))]);
                                    if (!empty($result['stored'])) update_option($sent_key, 1, false);
                                }
                            }
                        } catch (\Throwable $e) { $file_failures++; }
                    }
                    $results[$env] = ['pulled' => $pulled, 'pushed' => $pushed, 'pending_files' => $file_failures, 'time' => gmdate('c')];
                } catch (\Throwable $e) { $results[$env] = ['error' => $e->getMessage(), 'time' => gmdate('c')]; }
            }
            Store::cleanup();
            update_option('feedbackpress_sync_result', $results, false);
        } finally { delete_option('feedbackpress_sync_lock'); }
        return $results;
    }
}
