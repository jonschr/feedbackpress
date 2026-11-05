<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Store {
    public static function table(): string { global $wpdb; return $wpdb->prefix . 'feedbackpress_events'; }
    public static function install(): void {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table();
        dbDelta("CREATE TABLE $table (
            seq bigint unsigned NOT NULL AUTO_INCREMENT,
            id char(36) NOT NULL,
            issue_id char(36) NOT NULL,
            kind varchar(20) NOT NULL,
            payload longtext NOT NULL,
            created_at varchar(30) NOT NULL,
            environment varchar(12) NOT NULL,
            PRIMARY KEY  (seq),
            UNIQUE KEY event_id (id),
            KEY issue_id (issue_id)
        ) {$wpdb->get_charset_collate()};");
    }
    public static function uuid($id): bool { return is_string($id) && (bool) preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D', $id); }
    public static function append(string $issue, string $kind, array $payload): array {
        $event = ['id' => wp_generate_uuid4(), 'issue_id' => $issue, 'kind' => $kind, 'payload' => $payload, 'created_at' => gmdate('Y-m-d\TH:i:s\Z'), 'environment' => settings()['environment']];
        if ($kind === 'issue') {
            self::number_lock();
            try { $event['payload']['number'] = self::next_number($event['environment']); self::insert($event); }
            finally { self::number_unlock(); }
        } else self::insert($event);
        return $event;
    }
    private static function number_lock(): void {
        global $wpdb;
        if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 5)', 'fp_numbers_' . md5(DB_NAME . self::table()))) !== 1) throw new \RuntimeException('Feedback numbering is busy. Please retry.');
    }
    private static function number_unlock(): void {
        global $wpdb;
        $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', 'fp_numbers_' . md5(DB_NAME . self::table())));
    }
    private static function next_number(string $environment): string {
        $prefix = ['local' => '', 'staging' => 'S', 'production' => 'P'][$environment];
        $key = 'feedbackpress_number_' . $environment;
        $last = (int) get_option($key, 0);
        // Include synced numbers so a copied or restored counter cannot reuse an existing reference.
        foreach (self::events() as $event) {
            if (!in_array($event['kind'], ['issue', 'number'], true)) continue;
            $number = (string) ($event['payload']['number'] ?? '');
            if (preg_match('/^' . $prefix . '([1-9][0-9]*)$/D', $number, $match)) $last = max($last, (int) $match[1]);
        }
        update_option($key, $last + 1, false);
        return $prefix . ($last + 1);
    }
    public static function migrate_numbers(): void {
        if (get_option('feedbackpress_numbers_version') === '1') return;
        self::number_lock();
        try {
            $roots = []; $numbered = [];
            foreach (self::events() as $event) {
                if ($event['kind'] === 'issue') $roots[$event['issue_id']] = $event;
                if ($event['kind'] === 'number') $numbered[$event['issue_id']] = true;
            }
            foreach ($roots as $id => $event) {
                if (isset($event['payload']['number']) || isset($numbered[$id])) continue;
                // A new immutable event preserves references when existing feedback is synchronized.
                self::append($id, 'number', ['number' => self::next_number($event['environment'])]);
            }
            update_option('feedbackpress_numbers_version', '1', false);
        } finally { self::number_unlock(); }
    }
    public static function insert(array $e): bool {
        global $wpdb;
        // INSERT IGNORE only deduplicates immutable events; existing data is never replaced.
        $ok = $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . self::table() . ' (id,issue_id,kind,payload,created_at,environment) VALUES (%s,%s,%s,%s,%s,%s)', $e['id'], $e['issue_id'], $e['kind'], wp_json_encode($e['payload']), $e['created_at'], $e['environment']));
        if ($ok === false) throw new \RuntimeException('Could not save feedback. Please retry.');
        return $ok > 0;
    }
    public static function events(?string $issue = null): array {
        global $wpdb;
        $sql = 'SELECT * FROM ' . self::table();
        if ($issue !== null) $sql .= $wpdb->prepare(' WHERE issue_id=%s', $issue);
        return self::decode($wpdb->get_results($sql . ' ORDER BY seq', ARRAY_A));
    }
    public static function page(int $after): array {
        global $wpdb;
        return self::decode($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE seq>%d ORDER BY seq LIMIT 50', $after), ARRAY_A));
    }
    private static function decode(array $rows): array {
        foreach ($rows as &$r) { $r['seq'] = (int) $r['seq']; $r['payload'] = json_decode($r['payload'], true); }
        return $rows;
    }
    public static function reduce(array $events): ?array {
        $issue = null; $number = null; $statuses = []; $referenced = []; $files = []; $expired = []; $deleted = false; $updated = '';
        foreach ($events as $e) {
            $p = $e['payload'];
            if (in_array($e['kind'], ['issue', 'reply', 'status', 'file'], true)) $updated = max($updated, $e['created_at']);
            if ($e['kind'] === 'issue') {
                $issue = array_merge($p, ['id' => $e['issue_id'], 'created_at' => $e['created_at'], 'environment' => $e['environment']]);
                $statuses[$e['id']] = ['status' => 'todo', 'author' => $p['author'], 'environment' => $e['environment'], 'created_at' => $e['created_at']];
            }
            if ($e['kind'] === 'number') $number = $p['number'];
            if ($e['kind'] === 'status') {
                $statuses[$e['id']] = ['status' => $p['status'], 'author' => $p['author'], 'environment' => $e['environment'], 'created_at' => $e['created_at']];
                foreach ($p['parents'] as $parent) $referenced[$parent] = true;
            }
            if ($e['kind'] === 'file') $files[$e['id']] = array_merge($p, ['id' => $e['id']]);
            if ($e['kind'] === 'expire') $expired[$p['file_id']] = true;
            if ($e['kind'] === 'delete') $deleted = true;
        }
        if (!$issue || $deleted) return null;
        $issue['number'] = $issue['number'] ?? $number ?? substr($issue['id'], 0, 8);
        $heads = array_diff_key($statuses, $referenced); ksort($heads);
        $issue['heads'] = array_keys($heads);
        $issue['revision'] = hash('sha256', implode(',', $issue['heads']));
        $issue['conflict'] = count($heads) > 1;
        $issue['status'] = $issue['conflict'] ? 'review' : (reset($heads)['status'] ?? 'todo');
        $issue['updated_at'] = $updated;
        $issue['completed_at'] = $issue['status'] === 'done' ? reset($heads)['created_at'] : null;
        $issue['status_choices'] = array_values($heads);
        $issue['files'] = [];
        foreach ($files as $id => $f) {
            $f['comment_id'] = $f['comment_id'] ?? $issue['id'];
            $f['expired'] = isset($expired[$id]) || $f['expires_at'] <= time();
            $f['available'] = !$f['expired'] && is_file(self::file_path($id));
            $f['url'] = $f['available'] ? rest_url('feedbackpress/v1/files/' . $id) : null;
            $issue['files'][] = $f;
        }
        $issue['activity'] = array_values(array_filter($events, fn($e) => in_array($e['kind'], ['reply', 'status'], true)));
        return $issue;
    }
    public static function issue(string $id): ?array { return self::reduce(self::events($id)); }
    public static function issues(): array {
        $groups = [];
        foreach (self::events() as $e) $groups[$e['issue_id']][] = $e;
        return array_values(array_filter(array_map([self::class, 'reduce'], array_reverse($groups))));
    }
    public static function directory(): string {
        // Outside the public document root; files are served only through permission-checked endpoints.
        return defined('FEEDBACKPRESS_STORAGE_DIR') ? untrailingslashit(FEEDBACKPRESS_STORAGE_DIR) : dirname(untrailingslashit(ABSPATH)) . '/feedbackpress-private-' . substr(hash('sha256', ABSPATH), 0, 12);
    }
    public static function file_path(string $id): string { return self::directory() . '/' . $id; }
    public static function file_event(string $id): ?array {
        global $wpdb;
        $rows = self::decode($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . " WHERE id=%s AND kind='file'", $id), ARRAY_A));
        return $rows[0] ?? null;
    }
    public static function live_file(string $id): ?array {
        $e = self::file_event($id);
        if (!$e) return null;
        $issue = self::issue($e['issue_id']);
        foreach (($issue['files'] ?? []) as $f) if ($f['id'] === $id && !$f['expired']) return $f;
        return null;
    }
    public static function put_file(string $id, string $bytes): bool {
        $f = self::live_file($id);
        if (!$f || strlen($bytes) !== $f['size'] || !hash_equals($f['sha256'], hash('sha256', $bytes))) return false;
        if (str_starts_with(wp_normalize_path(self::directory()) . '/', wp_normalize_path(ABSPATH)) || !wp_mkdir_p(self::directory())) return false;
        $temp = tempnam(self::directory(), 'fp-');
        if (!$temp) return false;
        $ok = file_put_contents($temp, $bytes) === strlen($bytes) && rename($temp, self::file_path($id));
        if (is_file($temp)) unlink($temp);
        if ($ok) chmod(self::file_path($id), 0600);
        return $ok;
    }
    public static function cleanup(): void {
        foreach (self::events() as $e) {
            if ($e['kind'] !== 'file') continue;
            if (!self::live_file($e['id']) && is_file(self::file_path($e['id']))) unlink(self::file_path($e['id']));
        }
    }
}
