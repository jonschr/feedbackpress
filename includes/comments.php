<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Comments {
    public static function edit(\WP_REST_Request $r) {
        $issue = Store::issue($r['id']);
        if (!$issue) return API::error('Issue not found.', 404);
        $id = $r->get_param('comment_id'); $comment = $id === $issue['id'] ? $issue : null;
        if (!$comment) foreach ($issue['activity'] as $event) if ($event['kind'] === 'reply' && $event['id'] === $id) $comment = $event['payload'];
        if (!$comment) return API::error('Comment not found on this issue.', 404);
        try { $person = Identity::request($r); } catch (\InvalidArgumentException $e) { return API::error($e->getMessage()); }
        if (!hash_equals($comment['author_id'], $person['author_id'])) return API::error('You can only edit your own comments.', 403);
        if (!is_string($r->get_param('revision')) || !hash_equals($comment['edit_revision'], $r->get_param('revision'))) return API::error('This comment changed. Your draft is kept; reload the latest version before editing again.', 409);
        $body = is_string($r->get_param('body')) ? sanitize_textarea_field($r->get_param('body')) : '';
        if (!$body || strlen($body) > 10000) return API::error('Enter a comment of up to 10,000 characters.');
        $p = $person + ['comment_id' => $id, 'body' => $body, 'parents' => $comment['edit_heads']];
        if ($id === $issue['id']) {
            $title = $r->get_param('title') === null ? $issue['title'] : (is_string($r->get_param('title')) ? sanitize_text_field($r->get_param('title')) : '');
            if (!preg_match('/^.{1,120}$/usD', $title)) return API::error('Enter a title of up to 120 characters.');
            $p['title'] = $title;
        }
        Store::append($issue['id'], 'edit', $p);
        return Store::issue($issue['id']);
    }
}
