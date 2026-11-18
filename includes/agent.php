<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;

final class Agent {
    public static function category(): void {
        if (function_exists('wp_register_ability_category')) wp_register_ability_category('feedbackpress', ['label' => 'FeedbackPress', 'description' => 'Authorized website feedback workflows.']);
    }
    public static function abilities(): void {
        if (!function_exists('wp_register_ability')) return;
        wp_register_ability('feedbackpress/agent-guidance', [
            'label' => 'FeedbackPress agent guidance',
            'description' => 'Call before working on FeedbackPress tickets. Read the brief workflow, current WordPress identity, note-privacy rules, status criteria and text-suggestion instructions. This does not change tickets or grant access.',
            'category' => 'feedbackpress',
            'input_schema' => ['type' => 'object', 'additionalProperties' => false],
            'output_schema' => ['type' => 'object'],
            'permission_callback' => static fn() => API::read(),
            'execute_callback' => [self::class, 'guidance'],
            'meta' => ['public' => true, 'show_in_rest' => true, 'mcp' => ['public' => true, 'type' => 'tool'], 'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true]],
        ]);
        wp_register_ability('feedbackpress/ticket-link', [
            'label' => 'FeedbackPress ticket magic link',
            'description' => 'Get a direct shared-ticket magic link for use in chat with the user. Requires a site administrator. Private issues cannot be shared.',
            'category' => 'feedbackpress',
            'input_schema' => ['type' => 'object', 'properties' => ['issue_id' => ['type' => 'string', 'format' => 'uuid']], 'required' => ['issue_id'], 'additionalProperties' => false],
            'output_schema' => ['type' => 'object'],
            'permission_callback' => static fn() => current_user_can('manage_options') && API::read() === true,
            'execute_callback' => static function ($input) {
                try { return ReviewAccess::ticketLink((string) $input['issue_id']); }
                catch (\Throwable $e) { return API::error($e->getMessage(), $e->getCode() >= 400 && $e->getCode() <= 599 ? $e->getCode() : 400); }
            },
            'meta' => ['public' => true, 'show_in_rest' => true, 'mcp' => ['public' => true, 'type' => 'tool'], 'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true]],
        ]);
    }
    public static function guidance(): array {
        $loggedIn = is_user_logged_in();
        return [
            'identity' => ['authenticated' => $loggedIn, 'wordpress_user_id' => get_current_user_id(), 'name' => $loggedIn ? wp_get_current_user()->display_name : null, 'private_note_access' => $loggedIn ? 'Only notes belonging to this authenticated WordPress email; human ownership must be confirmed before using private agent notes.' : 'None. A review link or guest name/email is not a private-note identity.'],
            'workflow' => [
                'Read the ticket, current revision, shared discussion and any private notes you are authorized to read. Identify the requested outcome before editing.',
                'Work on the actual task. Set Doing when starting, implement the change and perform checks appropriate to the task.',
                'Leave a note only when useful: one or two short sentences stating the result, blocker or exact question. No progress diary, long explanation, repeated ticket text or pasted logs.',
                'Finish by updating the status using the criteria below. Re-read the current revision before a deliberate update; never overwrite someone else’s work or mark an unverified attempt Done.',
            ],
            'statuses' => [
                'todo' => 'To do: not started.',
                'doing' => 'Doing: actively working.',
                'needs_info' => 'Information needed: blocked by a specific missing answer; ask one brief, actionable question.',
                'review' => 'Review: implemented or plausibly complete, but needs human feedback, approval or subjective confirmation.',
                'done' => 'Done: definitively complete and objectively verified. A note is optional if the status is sufficient.',
            ],
            'notes' => [
                'human_connection' => 'When the authenticated connection represents a confirmed real human, implementation notes may be private to that WordPress email. Never use a different person’s identity.',
                'agent_only_or_uncertain' => 'A dedicated agent-only connection should use a short public reply, not a private note hidden under an agent account. If human ownership is uncertain, use only a safe public summary or omit the note; never expose private details.',
                'visibility' => 'Public replies may notify ticket participants. Keep private notes, credentials and internal details out of shared replies. Converting a private note to shared is an explicit publishing action.',
            ],
            'text_changes' => 'For proposed wording, use a text-change suggestion: target.text_change contains full original and proposed paragraph/heading text, with a selector and relative page path. Let the UI show the word diff; replacement copy is plain text. Regular notes are for context or results. Saving a suggestion or changing its status does not apply it to WordPress; apply separately only when the task authorizes publishing.',
            'ticket_references' => 'When referencing a shared ticket in chat with the user, use a direct ticket magic link rather than a bare number or ordinary issue URL. Retrieve it with feedbackpress/ticket-link, the link CLI command or the authorized review-link endpoint below. Do not construct a grant, extract credentials or relax permissions. Private issues stay private; if sharing is unavailable, use an authenticated issue URL and explain the access requirement briefly.',
            'access' => 'Use the site’s existing authorization. Locally, select the authorized WordPress user with wp --user=<login-or-ID>; filesystem access enables that workflow, not a local-hostname permission bypass. Remote MCP/REST uses the connected WordPress user, such as Application Password authentication. Never extract project/account keys or impersonate another user.',
            'interfaces' => [
                'mcp' => 'Discover and execute feedbackpress/agent-guidance through the WordPress Abilities API/MCP adapter when available. Retrieve direct ticket links with feedbackpress/ticket-link using issue_id. Use the connection’s existing WordPress REST or WP-CLI tools for ticket operations.',
                'cli' => ['guidance' => 'wp feedbackpress guidance', 'read' => 'wp --user=<user> feedbackpress get <issue-uuid>', 'ticket_link' => 'wp --user=<administrator> feedbackpress link <issue-uuid>', 'private_note' => 'wp --user=<human-user> feedbackpress note <issue-uuid> --body="Brief useful note" --agent="Agent name"', 'public_reply' => 'wp --user=<user> feedbackpress reply <issue-uuid> --body="Brief result or question" --revision=N', 'status' => 'wp --user=<user> feedbackpress status <issue-uuid> --status=done --revision=N'],
                'rest' => ['namespace' => rest_url('feedbackpress/v1/'), 'guidance' => 'GET agent-guidance', 'read' => 'GET issues/<uuid>', 'ticket_link' => 'GET issues/<uuid>/review-link (administrator)', 'private_note' => 'POST issues/<uuid>/notes: body, kind=agent, agent', 'public_reply' => 'POST issues/<uuid>/replies: body, revision', 'status' => 'POST issues/<uuid>/status: status, revision', 'retry' => 'Use a fresh UUID Idempotency-Key for each intentional mutation. Retry identical bytes with the same key. Honor Retry-After; do not hammer failed writes.'],
            ],
        ];
    }
}
