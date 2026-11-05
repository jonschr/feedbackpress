<?php
// Standalone read-only checks: php tests/search-sort.php (no WordPress database needed).
if (PHP_SAPI !== 'cli') exit;
define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');
function sanitize_text_field($value) { return trim(strip_tags($value)); }
class WP_REST_Request {
    public function __construct(private array $params) {}
    public function get_param($key) { return $this->params[$key] ?? null; }
}
$wpdb = new class {
    public string $prefix = 'test_';
    public array $rows = [];
    public function get_results($sql, $format) { return $this->rows; }
};
require dirname(__DIR__) . '/includes/store.php';
require dirname(__DIR__) . '/includes/api.php';
use FeedbackPress\Store;
use FeedbackPress\API;
function check($ok, $message) { if (!$ok) throw new RuntimeException($message); echo "PASS $message\n"; }
function uid($n) { return sprintf('%08d-1111-4111-8111-111111111111', $n); }
function event($id, $issue, $kind, $payload, $date) {
    return ['id' => uid($id), 'issue_id' => uid($issue), 'kind' => $kind, 'payload' => $payload, 'created_at' => '2026-11-' . $date . 'T12:00:00Z', 'environment' => 'local'];
}
function listing($params = []) { return API::listing(new WP_REST_Request($params)); }
function numbers($params = []) { return array_column(listing($params)['issues'], 'number'); }
$events = [];
foreach ([1 => ['todo', 'Replace the hero heading', '01'], 2 => ['done', 'Fix footer colors', '02'], 3 => ['review', 'Update navigation', '03'], 4 => ['done', 'Check contact form', '04']] as $n => [$status, $body, $day]) {
    $events[] = event($n, $n, 'issue', ['number' => (string) $n, 'author' => 'UnsearchableAuthor', 'body' => $body, 'path' => '/test/'], $day);
    if ($status !== 'todo') $events[] = event(10 + $n, $n, 'status', ['status' => $status, 'author' => 'Editor', 'parents' => [uid($n)]], $day);
}
$events[] = event(21, 1, 'reply', ['body' => 'Use the CAFÉ logo and literal a+b wording.', 'author' => 'Client'], '06');
$events[] = event(22, 2, 'reply', ['body' => 'The hero looks good.', 'author' => 'Client'], '07');
$events[] = event(23, 3, 'file', ['name' => 'note.pdf', 'expires_at' => 1], '08');
$events[] = event(24, 3, 'expire', ['file_id' => uid(23)], '09');
$events[] = event(25, 3, 'number', ['number' => '3'], '10');
// Stub only the table read; listing and reduction are the production implementation.
$wpdb->rows = array_map(fn($e) => array_merge($e, ['seq' => 1, 'payload' => json_encode($e['payload'])]), array_reverse($events));
check(numbers(['search' => 'HERO', 'status' => 'todo,review']) === ['1'], 'Search intersects the selected statuses');
check(numbers(['search' => 'hero', 'status' => 'done']) === ['2'], 'Reply-only matches surface completed issues when selected');
check(numbers(['search' => 'heading café']) === ['1'], 'All search terms match across issue and replies, case-insensitively with Unicode');
check(numbers(['search' => 'a+b']) === ['1'], 'Search treats regex punctuation literally');
check(numbers(['search' => 'UnsearchableAuthor']) === [], 'Search targets comment text rather than author metadata');
check(numbers(['search' => 'hero', 'status' => 'none']) === [], 'No selected statuses means no search results');
check(numbers(['search' => '   ', 'order' => 'number']) === ['1', '2', '3', '4'], 'Clearing search restores the filtered list');
check(numbers(['search' => 'hero', 'path' => '/other/']) === [], 'Page filtering also applies before search pagination');
check(numbers(['order' => 'completed']) === ['4', '2', '1', '3'], 'Completion sort is newest first with unfinished issues last');
check(numbers(['order' => 'updated']) === ['3', '2', '1', '4'], 'Last edited includes replies and uploads, excluding expiry and numbering');
check(listing(['order' => 'invalid'])['order'] === 'number', 'Unknown sort falls back to issue-number order');
$done = array_values(array_filter($events, fn($e) => $e['issue_id'] === uid(2)));
check(Store::reduce($done)['completed_at'] === '2026-11-02T12:00:00Z', 'Replies after completion do not change its date');
$reopened = event(30, 2, 'status', ['status' => 'review', 'author' => 'Client', 'parents' => [uid(12)]], '08');
check(Store::reduce([...$done, $reopened])['completed_at'] === null, 'Reopened issues have no current completion date');
$redone = event(31, 2, 'status', ['status' => 'done', 'author' => 'Editor', 'parents' => [uid(30)]], '09');
$again = Store::reduce([$redone, ...array_reverse($done), $reopened]);
check($again['completed_at'] === '2026-11-09T12:00:00Z' && $again['updated_at'] === $again['completed_at'], 'Re-completion dates survive out-of-order sync');
$conflict = event(32, 2, 'status', ['status' => 'doing', 'author' => 'Agent', 'parents' => [uid(12)]], '10');
check(Store::reduce([...$done, $redone, $reopened, $conflict])['completed_at'] === null, 'Conflicting statuses require Review rather than counting as completed');
$wpdb->rows = [];
for ($n = 1; $n <= 55; $n++) {
    $e = event(100 + $n, 100 + $n, 'issue', ['number' => (string) $n, 'author' => 'Client', 'body' => 'Search pagination needle', 'path' => '/pages/'], '01');
    $wpdb->rows[] = array_merge($e, ['seq' => $n, 'payload' => json_encode($e['payload'])]);
}
$first = listing(['search' => 'needle', 'order' => 'updated']);
$last = listing(['search' => 'needle', 'order' => 'updated', 'focus' => uid(155)]);
check($first['total'] === 55 && count($first['issues']) === 50 && $first['issues'][9]['number'] === '10', 'Search and stable date-sort ties apply before pagination');
check($last['page'] === 2 && count($last['issues']) === 5 && $last['issues'][4]['number'] === '55', 'Focused search results select the correct page');
echo "Search/sort checks passed. No database accessed.\n";
