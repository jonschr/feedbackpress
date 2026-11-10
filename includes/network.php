<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;

/** Shared configuration is encoded; private installation credentials never travel in configuration events. */
final class Network {
    const OPTION = 'feedbackpress_network_v1';
    const LOCAL = 'feedbackpress_identity_v1';
    public static function pack($value): string { return 'fp1:' . base64_encode(wp_json_encode($value)); }
    public static function unpack($value): array {
        if (!is_string($value) || !str_starts_with($value, 'fp1:')) return [];
        $raw = base64_decode(substr($value, 4), true);
        $decoded = $raw === false ? null : json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
    public static function data(): array { return self::unpack(get_option(self::OPTION, '')); }
    public static function local(): array { return self::unpack(get_option(self::LOCAL, '')); }
    public static function locked(string $key, callable $work) {
        global $wpdb;
        $name = 'fp_' . md5(DB_NAME . $wpdb->prefix . $key);
        if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 3)', $name)) !== 1) throw new \RuntimeException('Network settings are busy. Retry shortly.');
        try { wp_cache_delete(self::OPTION, 'options'); wp_cache_delete(self::LOCAL, 'options'); return $work(); }
        finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $name)); }
    }
    public static function persist(array $data, bool $replace = false): void {
        self::locked('config', function () use ($data, $replace) {
            $current = self::data();
            if (!$replace && ($current['id'] ?? '') !== $data['id']) throw new \RuntimeException('The network changed. Reload before saving.');
            $known = array_column($replace ? [] : ($current['events'] ?? []), null, 'id');
            foreach ($data['events'] as $event) {
                if (isset($known[$event['id']]) && $known[$event['id']] !== $event) throw new \RuntimeException('Configuration event cannot be changed.');
                $known[$event['id']] = $event;
            }
            $data['events'] = array_values($known);
            if (count($known) > 5000) throw new \RuntimeException('Network configuration history is full. Create a new network.');
            update_option(self::OPTION, self::pack($data), false);
        });
    }
    public static function home(): string { return self::url(home_url(), 'local'); }
    public static function url($value, string $type): string {
        if (!is_string($value) || strlen($value) > 2000) throw new \InvalidArgumentException('Invalid site URL.');
        $value = untrailingslashit(esc_url_raw(trim($value)));
        $p = wp_parse_url($value);
        if (!$p || empty($p['host']) || !in_array($p['scheme'] ?? '', $type === 'local' ? ['http', 'https'] : ['https'], true) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) throw new \InvalidArgumentException('Use HTTPS site URLs without credentials, query strings, or fragments. HTTP is allowed for local entries.');
        $host = strtolower($p['host']);
        return $p['scheme'] . '://' . $host . (isset($p['port']) ? ':' . $p['port'] : '') . rtrim($p['path'] ?? '', '/');
    }
    public static function suggested_type(string $url): string {
        $host = strtolower(trim((string) wp_parse_url($url, PHP_URL_HOST), '[]'));
        if (filter_var($host, FILTER_VALIDATE_IP)) return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) ? 'remote' : 'local';
        if ($host === 'localhost' || preg_match('/\.(localhost|local|test|localdomain|lan|home\.arpa)$/D', $host) || !str_contains($host, '.')) return 'local';
        return 'remote';
    }
    public static function row(array $row): array {
        $type = $row['type'] ?? '';
        if (!in_array($type, ['local', 'remote'], true) || !Store::uuid($row['id'] ?? null)) throw new \InvalidArgumentException('Invalid environment entry.');
        $hash = $row['token_hash'] ?? '';
        $prefix = $row['prefix'] ?? '';
        if (!is_string($hash) || ($hash !== '' && !preg_match('/^[a-f0-9]{64}$/D', $hash))) throw new \InvalidArgumentException('Invalid member identity.');
        if (!is_string($prefix) || !preg_match('/^(?:[A-Z0-9]{1,11}-?)?$/D', $prefix)) throw new \InvalidArgumentException('Invalid issue prefix.');
        foreach (['label', 'basic_user', 'basic_password'] as $field) if (!is_string($row[$field] ?? '') || strlen($row[$field] ?? '') > 500 || preg_match('/[\r\n\x00]/', $row[$field] ?? '')) throw new \InvalidArgumentException('Invalid environment credentials or label.');
        if (str_contains($row['basic_user'] ?? '', ':')) throw new \InvalidArgumentException('Basic Auth usernames cannot contain a colon.');
        return ['id' => $row['id'], 'label' => sanitize_text_field($row['label'] ?? ''), 'url' => self::url($row['url'] ?? '', $type), 'type' => $type, 'basic_user' => $type === 'remote' ? ($row['basic_user'] ?? '') : '', 'basic_password' => $type === 'remote' ? ($row['basic_password'] ?? '') : '', 'token_hash' => $hash, 'prefix' => $prefix];
    }
    public static function valid_event($event): bool {
        if (!is_array($event) || !Store::uuid($event['id'] ?? null) || !in_array($event['kind'] ?? '', ['name', 'peer'], true) || !is_string($event['key'] ?? null) || !is_array($event['parents'] ?? null) || count($event['parents']) > 100 || !is_string($event['at'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $event['at'])) return false;
        foreach ($event['parents'] as $parent) if (!Store::uuid($parent) || $parent === $event['id']) return false;
        if ($event['kind'] === 'name') return $event['key'] === 'name' && is_string($event['value'] ?? null) && strlen($event['value']) > 0 && strlen($event['value']) <= 120 && sanitize_text_field($event['value']) === $event['value'];
        if (!Store::uuid($event['key']) || !array_key_exists('value', $event)) return false;
        if ($event['value'] === null) return true;
        try { return is_array($event['value']) && self::row($event['value']) === $event['value'] && $event['value']['id'] === $event['key']; } catch (\Throwable $e) { return false; }
    }
    public static function view(?array $data = null): array {
        $data = $data ?? self::data(); $groups = []; $parents = [];
        foreach ($data['events'] ?? [] as $event) {
            $key = $event['kind'] . ':' . $event['key'];
            $groups[$key][$event['id']] = $event;
            foreach ($event['parents'] as $parent) $parents[$key][$parent] = true;
        }
        $result = ['id' => $data['id'] ?? '', 'name' => 'FeedbackPress network', 'peers' => [], 'heads' => [], 'conflicts' => []];
        foreach ($groups as $key => $events) {
            $heads = array_diff_key($events, $parents[$key] ?? []); ksort($heads);
            $result['heads'][$key] = array_keys($heads);
            if (count($heads) !== 1) { $result['conflicts'][$key] = array_values($heads); continue; }
            $event = reset($heads);
            if ($event['kind'] === 'name') $result['name'] = $event['value'];
            elseif ($event['value'] !== null) $result['peers'][$event['key']] = $event['value'];
        }
        $ids = array_column($data['events'] ?? [], 'id'); sort($ids);
        $result['revision'] = hash('sha256', implode(',', $ids));
        return $result;
    }
    public static function self(): ?array {
        $local = self::local(); $view = self::view();
        $row = $view['peers'][$local['member'] ?? ''] ?? null;
        if (!$row || ($local['network'] ?? '') !== $view['id'] || ($local['url'] ?? '') !== self::home() || $row['url'] !== self::home() || !hash_equals($row['token_hash'], hash('sha256', $local['token'] ?? ''))) return null;
        return $row;
    }
    private static function credential(array $identity): bool {
        if (!Store::uuid($identity['member'] ?? null) || !Store::uuid($identity['network'] ?? null) || !is_string($identity['token'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $identity['token'])) return false;
        $view = self::view(); $row = $view['peers'][$identity['member'] ?? ''] ?? null;
        return $row && $identity['network'] === $view['id'] && hash_equals($row['token_hash'], hash('sha256', $identity['token']));
    }
    private static function removed(string $url, string $member = ''): bool {
        $data = self::data(); $view = self::view($data);
        $removed = [];
        foreach ($data['events'] as $event) if ($event['kind'] === 'peer' && $event['value'] === null && in_array($event['id'], $view['heads']['peer:' . $event['key']] ?? [], true)) $removed[$event['key']] = true;
        if (isset($removed[$member])) return true;
        foreach ($view['peers'] as $peer) if ($peer['url'] === $url) return false;
        foreach ($data['events'] as $event) {
            if ($event['kind'] === 'peer' && ($event['value']['url'] ?? '') === $url && isset($removed[$event['key']])) return true;
        }
        return false;
    }
    /** A database copy keeps its network, but never impersonates the source URL. */
    public static function identify_copy(): void {
        $local = self::local(); $home = self::home();
        if (($local['url'] ?? '') === $home || !self::credential($local) || self::removed($home)) return;
        self::locked('identity', function () use ($home) {
            $local = self::local();
            if (($local['url'] ?? '') === $home || !self::credential($local) || self::removed($home)) return;
            $data = self::data(); $peers = self::view($data)['peers']; $row = null;
            foreach ($peers as $peer) if ($peer['url'] === $home) $row = $peer;
            if (!$row && count($peers) >= 50) throw new \RuntimeException('The network already has 50 sites.');
            $member = $row['id'] ?? wp_generate_uuid4(); $token = bin2hex(random_bytes(32));
            $row = self::row(array_merge($row ?? [], ['id' => $member, 'url' => $home, 'type' => $row['type'] ?? (wp_parse_url($home, PHP_URL_SCHEME) === 'http' ? 'local' : self::suggested_type($home)), 'label' => $row['label'] ?? '', 'token_hash' => hash('sha256', $token), 'prefix' => $row['prefix'] ?? strtoupper(substr($member, 0, 8)) . '-']));
            self::change($data, 'peer', $member, $row); self::persist($data);
            update_option(self::LOCAL, self::pack(['network' => $data['id'], 'member' => $member, 'token' => $token, 'url' => $home, 'copy' => ['network' => $data['id'], 'member' => $local['member'], 'token' => $local['token']], 'copy_pending' => true]), false);
            delete_option('feedbackpress_sync_lock');
            delete_option('feedbackpress_sync_started_' . hash('sha256', $home));
            delete_option('feedbackpress_peer_cooldowns');
            Log::add(['operation' => 'identify_copy', 'url' => $home]);
        });
    }
    /** Only an unfinished copy may reconcile its own credential after meeting newer directory history. */
    private static function restore_copy(): void {
        $local = self::local();
        if (empty($local['copy_pending']) || ($local['url'] ?? '') !== self::home() || !self::credential($local['copy'] ?? []) || self::removed(self::home(), $local['member'])) return;
        $data = self::data(); $view = self::view($data); $row = null; $changed = false;
        foreach ($data['events'] as $event) if ($event['kind'] === 'peer' && $event['key'] === $local['member'] && ($event['value']['url'] ?? '') === self::home() && in_array($event['id'], $view['heads']['peer:' . $local['member']] ?? [], true)) {
            if (!$row || $event['value']['token_hash'] !== hash('sha256', $local['token'])) $row = $event['value'];
        }
        if (!$row) return;
        foreach ($view['peers'] as $peer) if ($peer['url'] === self::home() && $peer['id'] !== $local['member']) {
            $row = array_merge($peer, ['id' => $local['member']]);
            self::change($data, 'peer', $peer['id'], null); $changed = true;
        }
        $row['token_hash'] = hash('sha256', $local['token']);
        if (($view['peers'][$local['member']] ?? null) !== $row) { self::change($data, 'peer', $row['id'], $row); $changed = true; }
        if ($changed) self::persist($data);
    }
    public static function copy_claim(\WP_REST_Request $r): ?array {
        if (!self::self() || strlen($r->get_body()) > 1500000) return null;
        $copy = $r->get_param('copy');
        if (!is_array($copy) || !self::credential($copy) || ($copy['network'] ?? '') !== $r->get_header('x-feedbackpress-network') || !Store::uuid($r->get_header('x-feedbackpress-member')) || !preg_match('/^[a-f0-9]{64}$/D', (string) $r->get_header('x-feedbackpress-token'))) return null;
        try { $url = self::url($copy['url'] ?? '', 'local'); } catch (\Throwable $e) { return null; }
        $member = $r->get_header('x-feedbackpress-member'); $existing = self::view()['peers'][$member] ?? null;
        if ($url === self::home() || $member === $copy['member'] || ($existing && $existing['url'] !== $url) || self::removed($url, $member)) return null;
        return array_merge($copy, ['url' => $url]);
    }
    public static function exchange_permission(\WP_REST_Request $r) {
        $permission = self::authenticate($r);
        return $permission === true || self::copy_claim($r) !== null ? true : $permission;
    }
    public static function register_copy(\WP_REST_Request $r, array $claim, array $previous): void {
        if (!self::credential($claim) || self::removed($claim['url'], $r->get_header('x-feedbackpress-member'))) throw new \RuntimeException('The copied network membership was revoked.');
        $incoming = self::view(['id' => $claim['network'], 'events' => $r->get_param('config')]);
        $id = $r->get_header('x-feedbackpress-member'); $row = $incoming['peers'][$id] ?? null;
        if (!$row || $row['url'] !== $claim['url'] || !hash_equals($row['token_hash'], hash('sha256', $r->get_header('x-feedbackpress-token')))) throw new \RuntimeException('Invalid copied site registration.');
        // Keep the destination's saved host credentials and issue prefix when an older database is copied over it.
        foreach ($previous['peers'] as $peer) if ($peer['url'] === $row['url']) $row = array_merge($peer, ['id' => $id, 'token_hash' => $row['token_hash']]);
        $data = self::data(); $view = self::view($data);
        foreach ($view['peers'] as $peer) if ($peer['url'] === $row['url'] && $peer['id'] !== $id) self::change($data, 'peer', $peer['id'], null);
        if (($view['peers'][$id] ?? null) !== $row) self::change($data, 'peer', $id, $row);
        self::persist($data);
    }
    public static function copy_synced(): void {
        if (empty(self::local()['copy_pending'])) return;
        self::locked('identity', function () {
            $local = self::local();
            if (!empty($local['copy_pending']) && self::self()) { $local['copy_pending'] = false; update_option(self::LOCAL, self::pack($local), false); }
        });
    }
    public static function change(array &$data, string $kind, string $key, $value): void {
        $view = self::view($data);
        $data['events'][] = ['id' => wp_generate_uuid4(), 'kind' => $kind, 'key' => $key, 'parents' => $view['heads'][$kind . ':' . $key] ?? [], 'at' => gmdate('Y-m-d\TH:i:s\Z'), 'value' => $value];
    }
    public static function merge(array $events, string $network): void {
        if (count($events) > 5000) throw new \InvalidArgumentException('Configuration history is too large.');
        foreach ($events as $event) if (!self::valid_event($event)) throw new \InvalidArgumentException('Invalid network configuration event.');
        $data = self::data();
        if ($data['id'] !== $network) throw new \RuntimeException('The network changed during configuration exchange.');
        $known = array_column($data['events'], null, 'id');
        foreach ($events as $event) {
            if (isset($known[$event['id']]) && $known[$event['id']] !== $event) throw new \RuntimeException('Network configuration event differs from the stored event.');
            $known[$event['id']] = $event;
        }
        $data['events'] = array_values($known); self::persist($data); self::restore_copy();
    }
    public static function configure(string $name, array $rows, string $revision): void {
        $data = self::data(); $view = self::view($data);
        if (!hash_equals($view['revision'], $revision)) throw new \RuntimeException('Network settings changed. Reload before saving.');
        $name = sanitize_text_field($name);
        if (!$name || strlen($name) > 120 || count($rows) > 50) throw new \InvalidArgumentException('Enter a network name and no more than 50 environments.');
        $validated = []; $urls = [];
        foreach ($rows as $row) {
            $old = $view['peers'][$row['id'] ?? ''] ?? [];
            $id = $row['id'] ?? '';
            if (!Store::uuid($id)) $id = wp_generate_uuid4();
            $row = self::row(array_merge($old, $row, ['id' => $id, 'token_hash' => $old['token_hash'] ?? '', 'prefix' => $old['prefix'] ?? strtoupper(substr($id, 0, 8)) . '-']));
            if (isset($urls[$row['url']])) throw new \InvalidArgumentException('Each site URL must appear only once.');
            $urls[$row['url']] = true; $validated[$id] = $row;
        }
        if ($view['name'] !== $name || isset($view['conflicts']['name:name'])) self::change($data, 'name', 'name', $name);
        foreach ($validated as $id => $row) if (($view['peers'][$id] ?? null) !== $row) self::change($data, 'peer', $id, $row);
        foreach ($view['heads'] as $key => $heads) if (str_starts_with($key, 'peer:') && !isset($validated[substr($key, 5)]) && (isset($view['peers'][substr($key, 5)]) || isset($view['conflicts'][$key]))) self::change($data, 'peer', substr($key, 5), null);
        self::persist($data);
    }
    public static function create(string $name): void {
        $name = sanitize_text_field($name);
        if (!$name || strlen($name) > 120) throw new \InvalidArgumentException('Enter a network name of up to 120 characters.');
        $id = wp_generate_uuid4(); $member = wp_generate_uuid4(); $token = bin2hex(random_bytes(32));
        $data = ['id' => $id, 'events' => []];
        self::change($data, 'name', 'name', $name);
        $home = self::home();
        self::change($data, 'peer', $member, self::row(['id' => $member, 'url' => $home, 'type' => wp_parse_url($home, PHP_URL_SCHEME) === 'http' ? 'local' : self::suggested_type($home), 'label' => 'This site', 'token_hash' => hash('sha256', $token), 'prefix' => '']));
        self::persist($data, true);
        update_option(self::LOCAL, self::pack(['network' => $id, 'member' => $member, 'token' => $token, 'url' => $home]), false);
    }
    public static function upgrade(): void {
        if (!self::data()) self::create('FeedbackPress network');
        try { self::identify_copy(); } catch (\Throwable $e) { Log::add(['operation' => 'identify_copy', 'error' => 'copy_not_registered', 'reason' => substr($e->getMessage(), 0, 200)]); }
        if (get_option('feedbackpress_activity_sync_version') !== '1') {
            wp_clear_scheduled_hook('feedbackpress_tick');
            $old = get_option('feedbackpress_settings', []);
            update_option('feedbackpress_settings', array_intersect_key($old, array_flip(['mode', 'retention', 'secret'])) + defaults(), false);
            update_option('feedbackpress_activity_sync_version', '1', false);
        }
    }
    public static function authenticate(\WP_REST_Request $r) {
        if (!self::self()) return API::error('This installation is not connected to this network.', 403);
        $view = self::view(); $member = $view['peers'][$r->get_header('x-feedbackpress-member')] ?? null;
        $token = (string) $r->get_header('x-feedbackpress-token');
        if (!hash_equals($view['id'], (string) $r->get_header('x-feedbackpress-network')) || !$member || !$member['token_hash'] || strlen($token) !== 64 || !hash_equals($member['token_hash'], hash('sha256', $token))) return API::error('Network membership is invalid or revoked.', 403);
        return true;
    }
    public static function admin(\WP_REST_Request $r) { return current_user_can('manage_options') && wp_verify_nonce($r->get_header('x-wp-nonce'), 'wp_rest') ? true : API::error('Administrator access and a fresh nonce are required.', 403); }
    public static function issue_invite(): array {
        if (!self::self()) throw new \RuntimeException('Join this installation before creating an invite.');
        return self::locked('identity', function () {
            $ticket = bin2hex(random_bytes(32)); $local = self::local();
            $local['invites'] = array_filter($local['invites'] ?? [], fn($invite) => $invite['expires'] > time());
            if (count($local['invites']) >= 10) $local['invites'] = array_slice($local['invites'], -9, null, true);
            $local['invites'][hash('sha256', $ticket)] = ['expires' => time() + DAY_IN_SECONDS];
            update_option(self::LOCAL, self::pack($local), false);
            return ['ticket' => $ticket, 'expires' => time() + DAY_IN_SECONDS];
        });
    }

    public static function export(): string {
        $view = self::view(); $self = self::self();
        if (!$self) throw new \RuntimeException('This installation is not a network member.');
        $issuer = $self; $invite = null; $failure = null;
        if ($self['type'] === 'remote') $invite = self::issue_invite();
        else foreach ($view['peers'] as $peer) {
            if ($peer['type'] !== 'remote' || !$peer['token_hash']) continue;
            try { $invite = Sync::request($peer, 'network/invite', []); $issuer = $peer; break; } catch (\Throwable $e) { $failure = $e; continue; }
        }
        if (!$invite) {
            $local = self::local();
            foreach ($view['peers'] as $peer) {
                $pending = $local['seeds'][$peer['id']] ?? [];
                if ($peer['type'] === 'remote' && (!$peer['token_hash'] || (isset($pending['token']) && hash_equals($peer['token_hash'], hash('sha256', $pending['token']))))) return self::provision($peer['id']);
            }
            if ($failure) throw new \RuntimeException('Could not create a connection code through the connected remote sites. ' . $failure->getMessage());
            throw new \RuntimeException('Add and save the first remote URL. A migrated copy connects automatically; for a separate installation, copy its setup code after saving.');
        }
        return self::pack(['format' => 1, 'id' => $view['id'], 'name' => $view['name'], 'bootstrap' => ['url' => $issuer['url'], 'type' => 'remote', 'basic_user' => $issuer['basic_user'], 'basic_password' => $issuer['basic_password']], 'ticket' => $invite['ticket'], 'expires' => $invite['expires']]);
    }
    public static function provision(string $id): string {
        return self::locked('identity', function () use ($id) {
            if (!self::self()) throw new \RuntimeException('Reconnect from an installation that is still a network member.');
            $data = self::data(); $local = self::local(); $peer = self::view()['peers'][$id] ?? null;
            if (!$peer || $peer['type'] !== 'remote' || $peer['url'] === self::home()) throw new \InvalidArgumentException('Choose another saved remote URL.');
            $pending = $local['seeds'][$id] ?? [];
            if (($pending['expires'] ?? 0) <= time() || !hash_equals($peer['token_hash'], hash('sha256', $pending['token'] ?? ''))) {
                $pending = ['token' => bin2hex(random_bytes(32)), 'expires' => time() + DAY_IN_SECONDS];
                $peer['token_hash'] = hash('sha256', $pending['token']);
                self::change($data, 'peer', $id, $peer); self::persist($data);
                $local['seeds'][$id] = $pending; update_option(self::LOCAL, self::pack($local), false);
            }
            return self::pack(['format' => 2, 'id' => $data['id'], 'bootstrap' => ['url' => $peer['url']], 'events' => self::data()['events'], 'member' => $id, 'token' => $pending['token'], 'expires' => $pending['expires']]);
        });
    }
    public static function accept_join(\WP_REST_Request $r) {
        if (strlen($r->get_body()) > 10000 || !self::self()) return API::error('This installation cannot authorize a join.', 403);
        $ticket = $r->get_param('ticket'); $network = $r->get_param('network'); $token = $r->get_param('token');
        if (!is_string($ticket) || !preg_match('/^[a-f0-9]{64}$/D', $ticket) || !is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token) || $network !== (self::data()['id'] ?? '')) return API::error('Invalid network invitation.', 403);
        try {
            return self::locked('identity', function () use ($r, $ticket, $token, $network) {
                if (!self::self() || self::data()['id'] !== $network) return API::error('The network changed.', 409);
                $local = self::local(); $key = hash('sha256', $ticket); $invite = $local['invites'][$key] ?? [];
                if (($invite['expires'] ?? 0) < time()) return API::error('Invitation expired or unavailable. Copy a new code.', 403);
                $view = self::view(); $type = $r->get_param('type');
                if (!in_array($type, ['local', 'remote'], true)) return API::error('Choose local or remote.');
                $url = self::url($r->get_param('url'), $type);
                if ($url === self::home()) return API::error('This URL is already the authorizing installation.');
                $existing = null; foreach ($view['peers'] as $peer) if ($peer['url'] === $url) $existing = $peer;
                $hash = hash('sha256', $token);
                if (isset($invite['member'])) {
                    if ($invite['member'] !== ($existing['id'] ?? null) || !hash_equals($existing['token_hash'] ?? '', $hash)) return API::error('This invitation has already been used.', 403);
                } else {
                    $data = self::data(); $id = $existing['id'] ?? wp_generate_uuid4();
                    $row = self::row(array_merge($existing ?? [], ['id' => $id, 'url' => $url, 'type' => $type, 'label' => $r->get_param('label') ?: 'Joined site', 'token_hash' => $hash, 'prefix' => $existing['prefix'] ?? strtoupper(substr($id, 0, 8)) . '-']));
                    self::change($data, 'peer', $id, $row); self::persist($data);
                    $local['invites'][$key]['member'] = $id;
                    update_option(self::LOCAL, self::pack($local), false);
                    $existing = $row;
                }
                return ['id' => $view['id'], 'member' => $existing['id'], 'events' => self::data()['events']];
            });
        } catch (\Throwable $e) { return API::error($e->getMessage()); }
    }
    public static function join(string $code, string $type): void {
        if (strlen($code) > 1500000) throw new \InvalidArgumentException('Setup code is too large.');
        $invite = self::unpack(trim($code));
        if (!in_array($invite['format'] ?? null, [1, 2], true) || !Store::uuid($invite['id'] ?? null) || !is_int($invite['expires'] ?? null) || $invite['expires'] < time() || !in_array($type, ['local', 'remote'], true) || !is_array($invite['bootstrap'] ?? null)) throw new \InvalidArgumentException('Paste a valid, unexpired setup code.');
        if ($invite['format'] === 2) {
            if ($type !== 'remote' || self::url($invite['bootstrap']['url'] ?? '', 'remote') !== self::home() || !is_string($invite['token'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $invite['token'])) throw new \InvalidArgumentException('This first-remote setup code is bound to a different URL.');
            $token = $invite['token'];
            $response = ['id' => $invite['id'], 'member' => $invite['member'] ?? '', 'events' => $invite['events'] ?? null];
        } else {
            if (!is_string($invite['ticket'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $invite['ticket'])) throw new \InvalidArgumentException('Invalid invitation.');
            $peer = self::row(array_merge($invite['bootstrap'], ['id' => wp_generate_uuid4(), 'type' => 'remote']));
            $pending = self::unpack(get_option('feedbackpress_pending_join', ''));
            $codeHash = hash('sha256', $code . self::home() . $type);
            $token = ($pending['code'] ?? '') === $codeHash ? $pending['token'] : bin2hex(random_bytes(32));
            update_option('feedbackpress_pending_join', self::pack(['code' => $codeHash, 'token' => $token]), false);
            $response = Sync::request($peer, 'network/join', ['network' => $invite['id'], 'ticket' => $invite['ticket'], 'url' => self::home(), 'type' => $type, 'token' => $token, 'label' => 'Joined site'], false);
        }
        if (($response['id'] ?? '') !== $invite['id'] || !Store::uuid($response['member'] ?? null) || !is_array($response['events'] ?? null) || count($response['events']) > 5000) throw new \RuntimeException('The bootstrap site returned an invalid network.');
        foreach ($response['events'] as $event) if (!self::valid_event($event)) throw new \RuntimeException('The bootstrap site returned invalid configuration.');
        $data = ['id' => $response['id'], 'events' => $response['events']]; $view = self::view($data);
        $member = $view['peers'][$response['member']] ?? null;
        if (!$member || $member['url'] !== self::home() || !hash_equals($member['token_hash'], hash('sha256', $token))) throw new \RuntimeException('The network did not authorize this installation.');
        if ($invite['format'] === 2) {
            // Replace the temporary provisioning credential as soon as the target installs it.
            $token = bin2hex(random_bytes(32)); $member['token_hash'] = hash('sha256', $token);
            self::change($data, 'peer', $member['id'], $member);
        }
        self::persist($data, true);
        update_option(self::LOCAL, self::pack(['network' => $data['id'], 'member' => $member['id'], 'token' => $token, 'url' => self::home()]), false);
        delete_option('feedbackpress_pending_join');
        $s = get_option('feedbackpress_settings', []); $s['secret'] = bin2hex(random_bytes(32)); update_option('feedbackpress_settings', $s, false);
    }
}
