<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Service {
    const OPTION = 'feedbackpress_connection_v3';
    public static function pack(array $value): string { return rtrim(strtr(base64_encode(wp_json_encode($value)), '+/', '-_'), '='); }
    public static function unpack(string $value): array { $raw = base64_decode(strtr($value, '-_', '+/'), true); $data = $raw === false ? null : json_decode($raw, true); return is_array($data) ? $data : []; }
    public static function connection(): array { return self::unpack((string) get_option(self::OPTION, '')); }
    public static function home(): string {
        $p = wp_parse_url(home_url()); $scheme = strtolower($p['scheme']); $port = $p['port'] ?? null;
        return $scheme . '://' . strtolower($p['host']) . ($port && !(($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) ? ':' . $port : '') . rtrim($p['path'] ?? '', '/');
    }
    public static function origin(string $value): string {
        $value = untrailingslashit(trim($value)); $p = wp_parse_url($value);
        if (!$p || !isset($p['scheme'], $p['host']) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment']) || !empty($p['path'])) throw new \InvalidArgumentException('Enter a service origin without a path or credentials.');
        $local = defined('FEEDBACKPRESS_ALLOW_LOCAL_SERVICE') && FEEDBACKPRESS_ALLOW_LOCAL_SERVICE && $p['host'] === '127.0.0.1' && $p['scheme'] === 'http';
        if ($p['scheme'] !== 'https' && !$local) throw new \InvalidArgumentException('The service must use HTTPS.');
        return $value;
    }
    private static function save(array $c): void { update_option(self::OPTION, self::pack($c), false); delete_transient('feedbackpress_activity_v2'); wp_clear_scheduled_hook('feedbackpress_tick'); }
    public static function locked(callable $work) {
        $key = 'feedbackpress_connection_lock_v3'; $owner = wp_generate_uuid4(); $acquired = false;
        for ($n = 0; $n < 40; $n++) {
            wp_cache_delete($key, 'options'); $old = get_option($key, []);
            if ($old && ($old['expires'] ?? 0) < time()) delete_option($key);
            if (add_option($key, ['owner' => $owner, 'expires' => time() + 35], '', false)) { $acquired = true; break; }
            usleep(100000);
        }
        if (!$acquired) throw new \RuntimeException('The project connection is being updated. Try again shortly.', 503);
        try { wp_cache_delete(self::OPTION, 'options'); return $work(); }
        finally { wp_cache_delete($key, 'options'); if ((get_option($key, [])['owner'] ?? '') === $owner) delete_option($key); }
    }
    public static function manager(string $method, string $path, $body = null, ?array $connection = null, bool $actor = false) {
        $c = $connection ?? self::connection();
        if (empty($c['manager'])) throw new \RuntimeException('Connect your FeedbackPress account in Settings → FeedbackPress.', 503);
        return self::http($method, self::origin($c['service']) . '/v1' . $path, $c['manager'], $body, '', $actor);
    }
    public static function connectAccount(string $origin, string $key): array {
        $origin = self::origin($origin); $key = trim($key);
        if (!$key || str_starts_with($key, 'fp2:')) throw new \InvalidArgumentException('Enter your FeedbackPress license or account access key.');
        try {
            if (!str_starts_with($key, 'fp_')) $key = self::http('POST', $origin . '/v1/licenses/session', '', ['license_key' => $key])['token'];
            $profile = self::http('GET', $origin . '/v1/account', $key);
            if (!empty($profile['owner_linking'])) self::http('POST', $origin . '/v1/account/owner', $key, new \stdClass(), '', true);
            $grant = self::http('POST', $origin . '/v1/account/connections', $key, new \stdClass());
        } catch (RemoteError $e) {
            if ($e->remoteCode === 'unauthorized') throw new RemoteError('That FeedbackPress account access key was not recognized. Check the key and try again. Your existing connection is unchanged.', 401, 'unauthorized');
            throw $e;
        }
        return self::locked(function () use ($origin, $profile, $grant) {
            $old = self::connection(); $same = ($old['account'] ?? '') === $profile['id'] && ($old['service'] ?? '') === $origin;
            if (!$same && !empty($old['manager']) && !empty($old['project']) && ($old['site_url'] ?? '') === self::home()) {
                try { self::manager('POST', '/projects/' . $old['project'] . '/sites/disconnect', ['url' => self::home()], $old); } catch (\Throwable $e) { /* Local account changes remain available while an old service is unreachable. */ }
            }
            $c = ['v' => 3, 'service' => $origin, 'account' => $profile['id'], 'manager' => $grant['token'], 'manager_id' => $grant['id']];
            if ($same) $c += array_intersect_key($old, array_flip(['project','token','credential_id','site_url','name','disconnected']));
            self::save($c); return ['connected' => true];
        });
    }
    public static function capabilities(): array {
        $origin = self::origin(self::connection()['service'] ?? 'https://feedbackpress.elod.in');
        try { return self::http('GET', $origin . '/v1/capabilities', ''); }
        catch (RemoteError $e) { if ($e->getCode() === 404) return ['free_signup' => false, 'upgrade' => false]; throw $e; }
    }
    public static function startFree(): array {
        $pending = self::locked(function () {
            if (!empty(self::connection()['manager'])) throw new \RuntimeException('This site already has an account connection.');
            $origin = self::origin(self::connection()['service'] ?? 'https://feedbackpress.elod.in');
            $pending = get_option('feedbackpress_signup_pending', []);
            if (!$pending || ($pending['origin'] ?? '') !== $origin) {
                $pending = ['origin' => $origin, 'id' => wp_generate_uuid4(), 'key' => 'fp_' . rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=')];
                update_option('feedbackpress_signup_pending', $pending, false);
            }
            return $pending;
        });
        self::http('POST', $pending['origin'] . '/v1/accounts/free', '', ['id' => $pending['id'], 'key' => $pending['key']]);
        if (!empty(self::connection()['manager'])) throw new \RuntimeException('The account connection changed. Reload before continuing.');
        $result = self::connectAccount($pending['origin'], $pending['key']);
        delete_option('feedbackpress_signup_pending'); return $result + ['key' => $pending['key']];
    }
    private static function applySite(array $c, array $site): array {
        $c['project'] = $site['project']; $c['token'] = $site['token']; $c['credential_id'] = $site['credential_id'];
        $c['site_url'] = $site['url']; $c['name'] = $site['name']; $c['disconnected'] = false;
        self::save($c); return $c;
    }
    public static function selectProject(string $id): array {
        if (!self::uuid($id)) throw new \InvalidArgumentException('Choose a project.');
        return self::locked(function () use ($id) { $c = self::connection(); return self::applySite($c, self::manager('POST', '/projects/' . $id . '/sites/connect', ['url' => self::home(), 'reconnect' => true], $c)); });
    }
    public static function ensureConnection(): array {
        $c = self::connection();
        if (empty($c['manager']) || empty($c['project']) || ($c['site_url'] ?? '') === self::home()) return $c;
        return self::locked(function () {
            $c = self::connection(); if (($c['site_url'] ?? '') === self::home()) return $c;
            try { return self::applySite($c, self::manager('POST', '/account/sites/resolve', ['url' => self::home(), 'project' => $c['project']], $c)); }
            catch (RemoteError $e) { if ($e->remoteCode === 'site_disconnected') { $c['site_url'] = self::home(); $c['disconnected'] = true; self::save($c); } throw $e; }
        });
    }
    public static function removeSite(string $url): array {
        $c = self::connection(); if (empty($c['project'])) throw new \InvalidArgumentException('Choose a project first.');
        $result = self::manager('POST', '/projects/' . $c['project'] . '/sites/disconnect', ['url' => $url]);
        if ($url === self::home()) { $c['disconnected'] = true; self::save($c); }
        return $result;
    }
    public static function disconnect(): array {
        $c = self::connection(); $removed = true;
        try { if (!empty($c['project']) && ($c['site_url'] ?? '') === self::home()) self::removeSite(self::home()); }
        catch (\Throwable $e) { $removed = false; }
        finally { delete_option(self::OPTION); delete_transient('feedbackpress_activity_v2'); }
        return ['disconnected' => true, 'remote_removed' => $removed];
    }
    public static function uuid($id): bool { return is_string($id) && (bool) preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/Di', $id); }
    public static function request(string $method, string $path, $body = null, string $key = '', bool $actor = false, ?array $connection = null, bool $raw = false, ?string $uploadMime = null) {
        if ($uploadMime !== null && ($method !== 'PUT' || !preg_match('~^/media/[a-f0-9-]{36}$~D', $path) || !is_string($body) || !in_array($uploadMime, API::UPLOAD_MIMES, true))) throw new \InvalidArgumentException('Invalid attachment upload type.');
        $c = $connection ?? self::ensureConnection();
        // Validate the exact credential being forwarded if a project switch races this request.
        if (class_exists(ReviewAccess::class, false) && !current_user_can('manage_options') && (settings()['mode'] === 'disabled' || (settings()['mode'] === 'admins' && !ReviewAccess::member($c) && !ReviewAccess::grant(null, $c)))) throw new \RuntimeException('Feedback is unavailable.', 403);
        if (empty($c['token']) || empty($c['project']) || !empty($c['disconnected'])) throw new \RuntimeException('Choose a project in Settings → FeedbackPress.', 503);
        $url = self::origin($c['service']) . '/v1/projects/' . $c['project'] . $path;
        try { return self::http($method, $url, $c['token'], $body, $key, $actor || is_user_logged_in(), $raw, self::home(), is_user_logged_in(), !is_user_logged_in() ? Email_Verification::current($c) : null, $uploadMime); }
        catch (RemoteError $e) { if ($e->getCode() === 401 || in_array($e->remoteCode, ['site_disconnected','site_mismatch'], true)) { $c['disconnected'] = true; self::save($c); } throw $e; }
    }
    public static function http(string $method, string $url, string $token, $body = null, string $key = '', bool $actor = false, bool $raw = false, ?string $site = null, bool $ownerView = false, ?array $reviewer = null, ?string $uploadMime = null) {
        if ($uploadMime !== null && ($method !== 'PUT' || !preg_match('~/v1/projects/[a-f0-9-]{36}/media/[a-f0-9-]{36}$~D', $url) || !in_array($uploadMime, API::UPLOAD_MIMES, true))) throw new \InvalidArgumentException('Invalid attachment upload type.');
        $headers = ['Accept' => 'application/json'];
        if ($token) $headers['Authorization'] = 'Bearer ' . $token;
        if ($site) $headers['X-FeedbackPress-Site'] = $site;
        if ($site && !$actor && class_exists(ReviewAccess::class, false)) {
            if (settings()['mode'] === 'everyone') $headers['X-FeedbackPress-Access'] = 'public';
            elseif ($proof = ReviewAccess::cookie()) $headers['X-FeedbackPress-Review'] = $proof;
        }
        if ($ownerView && $actor) $headers['X-FeedbackPress-View'] = 'owner';
        if ($reviewer) $headers['X-FeedbackPress-Reviewer'] = self::pack(['name' => $reviewer['name'], 'email' => $reviewer['email']]);
        if ($key) $headers['Idempotency-Key'] = $key;
        if ($actor) {
            if (!is_user_logged_in()) throw new \RuntimeException('Log in to WordPress to access private notes.', 403);
            $u = wp_get_current_user(); $headers['X-FeedbackPress-Actor'] = self::pack(['email' => strtolower(trim($u->user_email)), 'name' => $u->display_name]);
        }
        if ($body !== null) $headers['Content-Type'] = $method === 'PUT' ? ($uploadMime ?? (new \finfo(FILEINFO_MIME_TYPE))->buffer($body)) : 'application/json';
        $start = microtime(true);
        $r = wp_remote_request($url, ['method' => $method, 'timeout' => $uploadMime !== null ? 60 : 25, 'redirection' => 0, 'sslverify' => true, 'user-agent' => 'FeedbackPress/' . VERSION . '; WordPress gateway', 'headers' => $headers, 'body' => $body === null ? null : ($method === 'PUT' ? $body : wp_json_encode($body)), 'limit_response_size' => 20 * 1024 * 1024]);
        $status = is_wp_error($r) ? 0 : wp_remote_retrieve_response_code($r);
        Log::add(['operation' => $method, 'status' => $status, 'ms' => (int) ((microtime(true) - $start) * 1000), 'error' => is_wp_error($r) ? 'connection_failed' : '']);
        if (is_wp_error($r)) throw new \RuntimeException('Cannot reach the FeedbackPress service. Your unsaved changes are still here; try again.', 503);
        $bytes = wp_remote_retrieve_body($r);
        if ($status < 200 || $status >= 300) {
            $data = json_decode($bytes, true); $code = $data['error'] ?? 'service_error';
            $messages = ['email_verification_required' => 'Log in or verify your email before leaving feedback.', 'verification_invalid' => 'This verification link has already been used, expired or revoked. Request a new email.', 'verification_expired' => 'Request a new verification email.', 'verification_rate_limited' => 'Please wait before requesting another verification email.', 'verification_requires_public_site' => 'Use WordPress login on this local site. Email verification requires a public site.', 'invitations_unavailable' => str_ends_with($url, '/email-verification') ? 'Email verification is unavailable. Log in to WordPress to leave feedback.' : 'Email invitations are unavailable right now. You can copy a magic link instead.', 'invitation_delivery_failed' => str_ends_with($url, '/email-verification') ? 'The verification email could not be sent. Try again.' : 'The invitation could not be sent. Try again.', 'invitation_rate_limited' => 'Please wait a minute before sending more invitations.', 'feedback_paused' => 'New client tickets are paused. You can still reply to existing tickets.', 'account_owner_required' => 'Only the FeedbackPress account owner can pause or resume client feedback.', 'account_key_required' => 'Use your original subscription or account key to verify ownership.', 'project_limit_reached' => 'Your free account includes one project. Upgrade to unlimited projects for $30/month; your account key stays the same.', 'signup_rate_limit' => 'Free signup is temporarily busy. Try again in a minute.', 'author_mismatch' => 'You can change only your own notes.', 'private_issue' => 'Make this issue public before sharing a note.', 'feedback_unavailable' => 'This feedback is no longer available.', 'note_already_converted' => 'This note has already been converted. Reopen its current comment.', 'site_disconnected' => 'This site was removed from the project. An administrator can reconnect it in Settings → FeedbackPress.', 'site_mismatch' => 'The site connection changed. Reload this page.', 'license_invalid' => 'This license is invalid or inactive. Check the key from your FeedbackPress receipt.', 'license_product_mismatch' => 'This key is not for the configured FeedbackPress test product.', 'billing_unavailable' => 'License validation is temporarily unavailable. Try again shortly.', 'idempotency_conflict' => 'This request was already saved with different content. Check the issue list before submitting another change.', 'stale_revision' => 'This issue changed elsewhere. Reopen it before saving.', 'account_inactive' => 'This FeedbackPress account is inactive.', 'quota_exceeded' => 'The account storage allowance is full. Your text is saved.', 'unauthorized' => 'The project connection is no longer authorized. Reconnect in Settings → FeedbackPress.', 'not_found' => $raw ? 'This screenshot or attachment was not found.' : 'This issue or note was not found. Refresh the issue list before trying again.', 'media_missing' => 'The screenshot or attachment is temporarily unavailable. Try again.', 'wordpress_login_required' => 'Log in to WordPress to access private notes.', 'non_local_site_required' => 'Choose a connected HTTPS site with a public address for shared links.', 'connected_site_required' => 'Choose a site connected to this project.'];
            $messages += ['media_processing_busy' => 'Another attachment is being processed. Your text is saved. Retry in a few seconds.', 'media_processing_failed' => 'Attachment processing is temporarily unavailable. Your text is saved. Try again shortly.', 'media_workspace_unavailable' => 'Attachment processing is temporarily unavailable. Your text is saved. Try again shortly.', 'media_processing_limit' => 'This attachment took too long to process. Export a smaller copy and attach it again.', 'invalid_media' => 'This attachment could not be read. Check its format and attach a new copy.', 'invalid_image' => 'This image could not be read. Export a new copy and attach it again.', 'invalid_svg' => 'This SVG could not be processed safely. Export a new SVG or PNG and attach it again.', 'invalid_document' => 'This document could not be read. Use a supported, unencrypted file without macros.', 'media_type_mismatch' => 'The attachment contents do not match its file type. Export a new copy and attach it again.', 'media_size_mismatch' => 'The attachment was not received completely. Your text is saved. Retry the upload.', 'checksum_mismatch' => 'The attachment was not received correctly. Your text is saved. Retry the upload.', 'file_size_limit' => 'Each attachment must be 15 MiB or smaller after processing. Your text is saved.', 'image_dimensions_limit' => 'This image is too large to process safely. Export a smaller copy and attach it again.', 'image_animation_unsupported' => 'This animation could not be processed. Attach a static image or smaller GIF.', 'document_processing_limit' => 'This document is too complex to preview safely. Export a smaller copy and attach it again.', 'media_codec_unavailable' => 'This image format is temporarily unavailable. Export a PNG or JPEG and attach it again.', 'storage_limit' => 'The account storage allowance is full. Your text is saved.', 'media_expired' => 'This attachment upload has expired. Attach the file again.', 'media_unavailable' => 'This attachment is no longer available.', 'preview_unavailable' => 'A preview is unavailable for this attachment. Use Download to open the file.'];
            $retry = wp_remote_retrieve_header($r, 'retry-after');
            $retryAfter = $status === 429 && $code === 'media_processing_busy' ? (ctype_digit((string) $retry) ? max(1, min(60, (int) $retry)) : 5) : 0;
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- Returned as a REST JSON error and rendered with textContent, not HTML.
            throw new RemoteError($messages[$code] ?? ('FeedbackPress request failed (' . $status . ', ' . sanitize_key($code) . ').'), $status, $code, $retryAfter);
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
    public static function pageTitle(string $path): string {
        // Resolve against this installation, never another connected site's host.
        $home = wp_parse_url(home_url());
        if (!str_starts_with($path, '/') || str_starts_with($path, '//')) return '';
        $url = $home['scheme'] . '://' . $home['host'] . (isset($home['port']) ? ':' . $home['port'] : '') . $path;
        $id = url_to_postid($url);
        if (!$id && untrailingslashit($url) === untrailingslashit(home_url())) {
            if (get_option('show_on_front') !== 'page') return html_entity_decode(wp_strip_all_tags(get_bloginfo('name')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $id = (int) get_option('page_on_front');
        }
        $post = $id ? get_post($id) : null;
        // Cached shared views must not reveal titles of private/draft/password-protected pages.
        return $post && is_post_publicly_viewable($post) && !$post->post_password ? html_entity_decode(wp_strip_all_tags(get_the_title($post)), ENT_QUOTES | ENT_HTML5, 'UTF-8') : '';
    }
    public static function view(array $i): array {
        static $pageTitles = [];
        $pageKey = home_url() . '\n' . $i['path'];
        $pageTitle = $pageTitles[$pageKey] ??= self::pageTitle($i['path']);
        $comments = $i['comments']; $root = null; $activity = [];
        foreach ($comments as $comment) {
            $p = self::person($comment['author']) + ['body' => $comment['body'], 'mentions' => $comment['mentions'] ?? [], 'edit_revision' => (string) $i['revision'], 'edited_at' => $comment['edited_at'], 'visibility' => $comment['visibility'] ?? 'shared', 'owner_id' => $comment['owner_id'] ?? $comment['author']['id']];
            if ($comment['id'] === $i['id']) $root = $p;
            else $activity[] = ['id' => $comment['id'], 'kind' => 'reply', 'created_at' => $comment['created_at'], 'payload' => $p];
        }
        if (!$root) throw new \RuntimeException('The issue response is incomplete.', 503);
        $files = array_map(function ($m) {
            $file = ['id' => $m['id'], 'comment_id' => $m['comment_id'], 'name' => $m['name'], 'mime' => $m['mime'], 'size' => $m['size'], 'screenshot' => $m['screenshot'], 'visibility' => $m['visibility'] ?? 'shared', 'available' => $m['state'] === 'ready', 'expired' => $m['state'] === 'expired'];
            if (is_string($m['preview_mime'] ?? null) && $m['preview_mime'] !== '') $file['preview_mime'] = $m['preview_mime'];
            if (is_int($m['preview_size'] ?? null) || is_float($m['preview_size'] ?? null)) $file['preview_size'] = $m['preview_size'];
            return $file;
        }, $i['media']);
        return array_replace($root, array_intersect_key($i, array_flip(['id', 'number', 'title', 'path', 'target', 'status', 'created_at', 'updated_at', 'completed_at', 'visibility', 'owner_id']))) + ['page_title' => $pageTitle, 'revision' => (string) $i['revision'], 'target_revision' => (string) $i['revision'], 'author_revision' => (string) $i['revision'], 'activity' => $activity, 'files' => $files];
    }
}

final class RemoteError extends \RuntimeException {
    public string $remoteCode;
    public int $retryAfter;
    public function __construct(string $message, int $status, string $code, int $retryAfter = 0) { parent::__construct($message, $status); $this->remoteCode = $code; $this->retryAfter = $retryAfter; }
}
