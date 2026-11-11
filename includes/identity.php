<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Identity {
    public static function id(string $email): string { return hash('sha256', strtolower(trim($email))); }
    public static function users(): array {
        $people = [];
        foreach (get_users(['fields' => ['display_name', 'user_email']]) as $u) if ($u->user_email) $people[self::id($u->user_email)] = ['id' => self::id($u->user_email), 'name' => $u->display_name, 'email_identified' => true];
        return $people;
    }
    public static function request(\WP_REST_Request $r): array {
        if (is_user_logged_in()) { $u = wp_get_current_user(); return ['name' => $u->display_name, 'email' => strtolower(trim($u->user_email))]; }
        $name = sanitize_text_field((string) $r->get_param('author')); $email = strtolower(trim((string) $r->get_param('author_email')));
        if (!$name || strlen($name) > 120 || !is_email($email) || strlen($email) > 254) throw new \InvalidArgumentException('Enter your name and a valid email address.');
        return ['name' => $name, 'email' => $email];
    }
    public static function people(): array {
        $people = [];
        foreach (Service::request('GET', '/people') as $p) $people[$p['id']] = ['id' => $p['id'], 'name' => $p['name'], 'email_identified' => true];
        $people = array_values(array_replace($people, self::users()));
        usort($people, fn($a, $b) => strcasecmp($a['name'], $b['name'])); return $people;
    }
}
