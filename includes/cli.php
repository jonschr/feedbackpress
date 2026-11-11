<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
if (defined('WP_CLI') && WP_CLI) {
    /** FeedbackPress commands use the explicitly selected WordPress user's identity. */
    \WP_CLI::add_command('feedbackpress', function ($args, $flags) {
        if (!is_user_logged_in()) \WP_CLI::error('Select a WordPress user with --user=<login|ID|email>.');
        $command = $args[0] ?? 'help'; $id = $args[1] ?? ''; $method = 'GET'; $body = [];
        try {
            if ($command === 'help') { \WP_CLI::line('list | get <issue> | status <issue> --status=done --revision=N | reply <issue> --body=TEXT --revision=N | note <issue> --body=TEXT [--agent=NAME] | notes <issue> | convert <issue> <note> --revision=N | connect --file=PRIVATE_CODE_FILE | log\nPrivate agent notes are the default for note; reply is explicitly shared. Use --request-id=UUID to retry the same mutation safely.'); return; }
            if ($command === 'connect') {
                if (!current_user_can('manage_options')) throw new \RuntimeException('Administrator access required.');
                if (empty($flags['file'])) throw new \InvalidArgumentException('Use --file with a private connection-code file.');
                Service::connect(trim(file_get_contents($flags['file']))); \WP_CLI::success('Connected project.'); return;
            }
            if ($command === 'log') { if (!current_user_can('manage_options')) throw new \RuntimeException('Administrator access required.'); \WP_CLI::line(wp_json_encode(Log::entries(), JSON_PRETTY_PRINT)); return; }
            if (!API::can_view()) throw new \RuntimeException('This user does not have review access.');
            if ($command === 'list') { $path = '/issues'; $body = ['status' => $flags['statuses'] ?? 'todo,review', 'search' => $flags['search'] ?? '', 'page' => (int) ($flags['page'] ?? 1), 'order' => $flags['sort'] ?? 'number']; }
            elseif ($command === 'get') $path = '/issues/' . $id;
            elseif ($command === 'notes') $path = '/issues/' . $id . '/notes';
            elseif ($command === 'note') { $path = '/issues/' . $id . '/notes'; $method = 'POST'; $body = ['body' => $flags['body'] ?? '', 'agent' => $flags['agent'] ?? 'Agent', 'kind' => 'agent']; }
            elseif ($command === 'convert') { $path = '/issues/' . $id . '/notes/' . ($args[2] ?? '') . '/convert'; $method = 'POST'; $body = ['revision' => (int) ($flags['revision'] ?? 0)]; }
            elseif (in_array($command, ['status', 'reply'], true)) {
                if (!isset($flags['revision'])) throw new \InvalidArgumentException('Read the issue and pass its current --revision=N.');
                $path = '/issues/' . $id . '/' . ($command === 'reply' ? 'replies' : 'status'); $method = 'POST';
                $body = ['revision' => (int) $flags['revision']] + ($command === 'status' ? ['status' => $flags['status'] ?? ''] : ['body' => $flags['body'] ?? '']);
            } else throw new \InvalidArgumentException('Unknown command. Run wp feedbackpress help.');
            $request = new \WP_REST_Request($method, '/feedbackpress/v1' . $path); $request->set_header('Idempotency-Key', $flags['request-id'] ?? wp_generate_uuid4());
            foreach ($body as $k => $v) $request->set_param($k, $v);
            $response = rest_do_request($request);
            if ($response->get_status() >= 400) throw new \RuntimeException($response->get_data()['message'] ?? 'Request failed.');
            \WP_CLI::line(wp_json_encode($response->get_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } catch (\Throwable $e) { \WP_CLI::error($e->getMessage()); }
    });
}
