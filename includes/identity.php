<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Identity {
    public static function id(string $email): string { return hash('sha256', strtolower(trim($email))); }
    public static function payload_id(array $p): string { return $p['author_id'] ?? hash('sha256', 'legacy:' . ($p['author'] ?? '')); }
    public static function users(): array {
        $people = [];
        foreach (get_users(['fields' => ['display_name', 'user_email']]) as $user) if ($user->user_email) $people[self::id($user->user_email)] = ['id' => self::id($user->user_email), 'name' => sanitize_text_field($user->display_name), 'email_identified' => true];
        return $people;
    }
    public static function name(array $p): string { $users = self::users(); return $users[self::payload_id($p)]['name'] ?? ($p['author'] ?? 'Unknown author'); }
    public static function people(): array {
        $people = [];
        foreach (Store::events() as $event) if (in_array($event['kind'], ['issue', 'reply', 'author', 'person'], true)) {
            $p = $event['payload']; $id = self::payload_id($p);
            $people[$id] = ['id' => $id, 'name' => $p['author'], 'email_identified' => isset($p['author_id'])];
        }
        $people = array_values(array_replace($people, self::users()));
        usort($people, fn($a, $b) => strcasecmp($a['name'], $b['name']) ?: strcmp($a['id'], $b['id']));
        return $people;
    }
    public static function request(\WP_REST_Request $r): array {
        if (is_user_logged_in() && !API::key($r)) {
            $u = wp_get_current_user(); return ['author' => sanitize_text_field($u->display_name), 'author_id' => self::id($u->user_email)];
        }
        if (is_string($r->get_param('author_id')) && API::key($r)) foreach (self::people() as $person) if ($person['id'] === $r->get_param('author_id')) return ['author' => $person['name'], 'author_id' => $person['id']];
        $name = is_string($r->get_param('author')) ? sanitize_text_field($r->get_param('author')) : '';
        $email = $r->get_param('author_email');
        if (!$name || strlen($name) > 120 || !is_string($email) || strlen($email) > 254 || !is_email($email)) throw new \InvalidArgumentException('Enter your name and a valid email address.');
        return ['author' => $name, 'author_id' => self::id($email)];
    }
    public static function register(\WP_REST_Request $r) {
        try {
            // Registration identifies the selected person, independently of the logged-in editor.
            $name = is_string($r->get_param('name')) ? sanitize_text_field($r->get_param('name')) : ''; $email = $r->get_param('email');
            if (!is_string($name) || !trim($name) || strlen($name) > 120 || !is_string($email) || strlen($email) > 254 || !is_email($email)) return API::error('Enter a name and valid email address.');
            $p = ['author' => sanitize_text_field($name), 'author_id' => self::id($email)];
            if (!in_array($p['author_id'], array_column(self::people(), 'id'), true)) Store::append(wp_generate_uuid4(), 'person', $p);
            return ['id' => $p['author_id'], 'name' => self::name($p)];
        } catch (\Throwable $e) { return API::error($e->getMessage()); }
    }
    public static function assign(\WP_REST_Request $r) {
        $issue = Store::issue($r['id']);
        if (!$issue) return API::error('Issue not found.', 404);
        if (!is_string($r->get_param('revision')) || !hash_equals($issue['author_revision'], $r->get_param('revision'))) return API::error('The author changed. Reopen the issue and try again.', 409);
        foreach (self::people() as $person) if ($person['id'] === $r->get_param('author_id')) {
            Store::append($issue['id'], 'author', ['author' => $person['name'], 'author_id' => $person['id'], 'parents' => $issue['author_heads']]);
            return Store::issue($issue['id']);
        }
        return API::error('Choose an author from the list.');
    }
}
