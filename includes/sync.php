<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Sync {
    public static function permission(\WP_REST_Request $r) { return Network::authenticate($r); }
    public static function validate($e): bool {
        if (!is_array($e) || !Store::uuid($e['id'] ?? null) || !Store::uuid($e['issue_id'] ?? null) || !in_array($e['environment'] ?? '', ['local', 'remote'], true) || !is_string($e['created_at'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $e['created_at']) || !is_array($e['payload'] ?? null)) return false;
        $p = $e['payload'];
        $text = fn($s, $n) => is_string($s) && strlen($s) > 0 && strlen($s) <= $n && sanitize_textarea_field($s) === $s;
        if (isset($p['number']) && (!is_string($p['number']) || !preg_match('/^(?:[A-Z0-9]{1,12}-?)?[1-9][0-9]{0,9}$/D', $p['number']))) return false;
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
    public static function exchange(\WP_REST_Request $r) {
        try {
            if (strlen($r->get_body()) > 1500000) return API::error('Exchange too large.', 413);
            $known = $r->get_param('known'); $events = $r->get_param('events'); $config = $r->get_param('config');
            if (!is_array($known) || count($known) > 20000 || !is_array($events) || count($events) > 50 || !is_array($config)) return API::error('Invalid exchange.');
            foreach ($known as $id) if (!Store::uuid($id)) return API::error('Invalid event inventory.');
            foreach ($events as $event) if (!self::validate($event)) return API::error('Invalid feedback event.');
            Network::merge($config, (string) $r->get_header('x-feedbackpress-network'));
            // Recheck membership after applying a removal/configuration event.
            if (self::permission($r) !== true) return API::error('Network membership is no longer active.', 403);
            foreach ($events as $event) Store::insert($event, (string) $r->get_header('x-feedbackpress-network'));
            $all = Store::events(); $known = array_fill_keys($known, true);
            $missing = array_values(array_filter($all, fn($event) => !isset($known[$event['id']])));
            $files = [];
            foreach (Store::issues() as $issue) foreach ($issue['files'] as $file) if ($file['available']) $files[] = $file['id'];
            return ['network' => Network::data()['id'], 'config' => Network::data()['events'], 'ids' => array_column($all, 'id'), 'events' => array_slice($missing, 0, 50), 'more' => count($missing) > 50, 'files' => $files];
        } catch (\Throwable $e) { return API::error($e->getMessage()); }
    }
    public static function get_file(\WP_REST_Request $r) {
        $file = Store::live_file($r['id']);
        if (!$file || !is_file(Store::file_path($r['id']))) return API::error('Attachment is unavailable.', 404);
        return ['data' => base64_encode(file_get_contents(Store::file_path($r['id'])))];
    }
    public static function put_file(\WP_REST_Request $r) {
        $data = $r->get_param('data');
        if (!is_string($data) || strlen($data) > 4 * ceil(API::MAX_FILE / 3)) return API::error('Invalid file size.');
        $bytes = base64_decode($data, true); $file = Store::live_file($r['id']);
        if (!$file) return ['skipped' => true];
        if ($bytes === false || !API::valid_file($bytes, $file['mime']) || !Store::put_file($r['id'], $bytes)) return API::error('Invalid file or storage unavailable.');
        return ['stored' => true];
    }
    public static function user_agent(): string { return 'FeedbackPress/' . VERSION . ' (+https://github.com/jonschr/feedbackpress)'; }
    public static function request(array $peer, string $path, ?array $body = null, bool $authenticated = true): array {
        $url = Network::url($peer['url'] ?? '', $peer['type'] ?? 'remote');
        $operation = explode('?', $path)[0];
        $log = ['peer' => $peer['id'] ?? 'bootstrap', 'url' => $url, 'operation' => $operation];
        $cooldowns = Network::unpack(get_option('feedbackpress_peer_cooldowns', ''));
        $key = hash('sha256', $url);
        if (($cooldowns[$key]['until'] ?? 0) > time()) throw new \RuntimeException('Peer is cooling down; see the sync log.');
        $headers = ['Content-Type' => 'application/json', 'User-Agent' => self::user_agent()];
        if ($authenticated) {
            $local = Network::local();
            $headers += ['X-FeedbackPress-Network' => $local['network'], 'X-FeedbackPress-Member' => $local['member'], 'X-FeedbackPress-Token' => $local['token']];
        }
        if (!empty($peer['basic_user']) || !empty($peer['basic_password'])) $headers['Authorization'] = 'Basic ' . base64_encode(($peer['basic_user'] ?? '') . ':' . ($peer['basic_password'] ?? ''));
        $args = ['timeout' => 10, 'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 8 * 1024 * 1024, 'headers' => $headers];
        if ($body !== null) { $args['method'] = 'POST'; $args['body'] = wp_json_encode($body); }
        // Sequential REST requests with a small gap avoid bursts at hosting firewalls.
        static $lastRequest = 0.0;
        $gap = 0.15 - (microtime(true) - $lastRequest);
        if ($gap > 0) usleep((int) ($gap * 1000000));
        $start = microtime(true); $lastRequest = $start;
        $response = wp_remote_request($url . '/?rest_route=/feedbackpress/v1/' . $path, $args);
        $status = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
        $log += ['status' => $status, 'ms' => (int) round((microtime(true) - $start) * 1000)];
        if ($status !== 200) {
            $failures = ($cooldowns[$key]['failures'] ?? 0) + 1;
            $delay = min(900, 60 * (2 ** min(4, $failures - 1)));
            if ($status === 429) {
                $retry = wp_remote_retrieve_header($response, 'retry-after');
                $delay = max($delay, is_numeric($retry) ? (int) $retry : max(0, (int) strtotime((string) $retry) - time()));
            }
            $cooldowns[$key] = ['until' => time() + $delay, 'failures' => $failures];
            update_option('feedbackpress_peer_cooldowns', Network::pack(array_slice($cooldowns, -50, null, true)), false);
            Log::add($log + ['error' => $status ? 'http_error' : 'transport_error', 'retry_at' => time() + $delay]);
            throw new \RuntimeException($status ? 'Peer returned HTTP ' . $status . '. Check membership, Basic Auth and firewall logs.' : 'Could not connect to peer. Check DNS, TLS, and connectivity.');
        }
        $json = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($json)) { $cooldowns[$key] = ['until' => time() + 60, 'failures' => 1]; update_option('feedbackpress_peer_cooldowns', Network::pack($cooldowns), false); Log::add($log + ['error' => 'invalid_json', 'retry_at' => time() + 60]); throw new \RuntimeException('Peer returned invalid JSON.'); }
        unset($cooldowns[$key]); update_option('feedbackpress_peer_cooldowns', Network::pack($cooldowns), false);
        Log::add($log);
        return $json;
    }
    public static function activity(\WP_REST_Request $r) {
        $result = self::run();
        $result['network'] = Network::data()['id'] ?? '';
        $result['cursor'] = Store::cursor();
        if ($result['state'] !== 'disconnected') {
            $result['issues'] = Store::issues();
            $result['new_issues'] = array_values(array_unique(array_column(array_filter(Store::events(), fn($event) => $event['kind'] === 'issue' && $event['seq'] > max(0, (int) $r->get_param('since'))), 'issue_id')));
        }
        return $result;
    }
    public static function run(): array {
        if (!bound()) return ['state' => 'disconnected'];
        $lock = 'feedbackpress_sync_lock'; $stamp = time();
        $old = (int) get_option($lock, 0);
        if ($old && $old < $stamp - 120) delete_option($lock);
        if (!add_option($lock, $stamp, '', false)) return ['state' => 'busy'];
        $key = 'feedbackpress_sync_started_' . hash('sha256', Network::home());
        try {
            $last = (int) get_option($key, 0);
            if ($last > $stamp - 60) return ['state' => 'cooldown', 'next' => $last + 60];
            update_option($key, $stamp, false);
            $network = Network::data()['id']; $deadline = microtime(true) + 20; $results = [];
            foreach (Network::view()['peers'] as $id => $peer) {
                if ($peer['type'] !== 'remote' || !$peer['token_hash'] || $peer['url'] === Network::home()) continue;
                if (microtime(true) >= $deadline) break;
                try {
                    $remote = []; $sent = 0; $received = 0; $files = 0;
                    for ($round = 0; $round < 20 && microtime(true) < $deadline; $round++) {
                        if (Network::data()['id'] !== $network || !bound()) throw new \RuntimeException('Network changed during sync.');
                        $fresh = Network::view()['peers'][$id] ?? null;
                        if (!$fresh || !$fresh['token_hash'] || $fresh['url'] !== $peer['url']) throw new \RuntimeException('Peer membership changed during sync.');
                        $peer = $fresh;
                        $all = Store::events(); $knownRemote = array_fill_keys($remote, true);
                        $outgoing = $round ? array_slice(array_values(array_filter($all, fn($event) => !isset($knownRemote[$event['id']]))), 0, 50) : [];
                        $data = self::request($peer, 'sync/exchange', ['known' => array_column($all, 'id'), 'events' => $outgoing, 'config' => Network::data()['events']]);
                        if (($data['network'] ?? '') !== $network || !is_array($data['config'] ?? null) || !is_array($data['ids'] ?? null) || !is_array($data['events'] ?? null) || count($data['events']) > 50 || !is_array($data['files'] ?? null)) throw new \RuntimeException('Peer returned an invalid exchange.');
                        if (count($data['ids']) > 20000 || count($data['files']) > 20000) throw new \RuntimeException('Peer inventory is too large.');
                        foreach (array_merge($data['ids'], $data['files']) as $uuid) if (!Store::uuid($uuid)) throw new \RuntimeException('Peer returned an invalid inventory.');
                        foreach ($data['events'] as $event) if (!self::validate($event)) throw new \RuntimeException('Peer returned invalid feedback.');
                        Network::merge($data['config'], $network);
                        if (Network::data()['id'] !== $network || !bound()) throw new \RuntimeException('This installation was removed or its identity changed.');
                        foreach ($data['events'] as $event) { Store::insert($event, $network); $received++; }
                        $sent += count($outgoing); $remote = $data['ids'];
                        $remaining = array_diff(array_column(Store::events(), 'id'), $remote);
                        if (!$remaining && empty($data['more'])) break;
                    }
                    $remoteFiles = array_fill_keys($data['files'] ?? [], true);
                    foreach (Store::issues() as $issue) foreach ($issue['files'] as $file) {
                        if (Network::data()['id'] !== $network || !bound() || !isset(Network::view()['peers'][$id])) throw new \RuntimeException('Network membership changed during attachment transfer.');
                        if ($file['expired'] || microtime(true) >= $deadline) continue;
                        if (!$file['available'] && isset($remoteFiles[$file['id']])) {
                            $encoded = self::request($peer, 'sync/files/' . $file['id'])['data'] ?? '';
                            $bytes = is_string($encoded) ? base64_decode($encoded, true) : false;
                            if ($bytes === false || !API::valid_file($bytes, $file['mime']) || !Store::put_file($file['id'], $bytes)) throw new \RuntimeException('Attachment checksum or storage validation failed.');
                            $files++;
                        } elseif ($file['available'] && !isset($remoteFiles[$file['id']])) {
                            $result = self::request($peer, 'sync/files/' . $file['id'], ['data' => base64_encode(file_get_contents(Store::file_path($file['id'])))]);
                            if (!empty($result['stored'])) $files++;
                        }
                    }
                    $results[$id] = ['sent' => $sent, 'received' => $received, 'files' => $files];
                    Log::add(['peer' => $id, 'operation' => 'complete', 'events' => $sent + $received, 'files' => $files]);
                } catch (\Throwable $e) { $results[$id] = ['error' => $e->getMessage()]; Log::add(['peer' => $id, 'url' => $peer['url'], 'operation' => 'sync', 'error' => 'exchange_incomplete', 'reason' => substr($e->getMessage(), 0, 200)]); }
            }
            Store::cleanup();
            $result = ['state' => 'complete', 'next' => $stamp + 60, 'peers' => $results];
            update_option('feedbackpress_sync_result', Network::pack($result), false);
            return $result;
        } finally { if ((int) get_option($lock) === $stamp) delete_option($lock); }
    }
}
