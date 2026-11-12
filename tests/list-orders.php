<?php
// Standalone WordPress listing harness. No database, network or writes.
namespace {
    define('ABSPATH', __DIR__);
    class WP_REST_Request {
        public function __construct(private array $params) {}
        public function get_param($key) { return $this->params[$key] ?? null; }
        public function has_param($key) { return array_key_exists($key, $this->params); }
    }
}
namespace FeedbackPress {
    class Service {
        public static array $items;
        public static function snapshot(): array { return ['issues' => self::$items]; }
    }
}
namespace {
    require dirname(__DIR__) . '/includes/api.php';
    function listing(array $params): array { return FeedbackPress\API::listing(new WP_REST_Request($params)); }
    if (($argv[1] ?? '') === 'serve') {
        $input = json_decode(file_get_contents('php://stdin'), true, 512, JSON_THROW_ON_ERROR);
        FeedbackPress\Service::$items = $input['items'];
        echo json_encode(listing($input['params']), JSON_THROW_ON_ERROR); exit;
    }
    $fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/list-orders.json'), true);
    FeedbackPress\Service::$items = $fixture['items'];
    foreach (['none' => 'flat', 'page' => 'grouped'] as $group => $key) foreach ($fixture[$key] as $order => $expected) {
        $actual = array_column(listing(['order' => $order, 'group' => $group])['issues'], 'number');
        if ($actual !== $expected) throw new RuntimeException('Wrong order: ' . $group . '/' . $order);
        $scoped = listing(['order' => $order, 'group' => $group, 'path' => '/?page_id=2&view=full']);
        if (array_column($scoped['issues'], 'number') !== array_values(array_filter($expected, fn($n) => $n % 2 === 0))) throw new RuntimeException('Page scope ignored.');
        if ($scoped['total'] !== 2 || $scoped['status_counts']['todo'] !== 1 || $scoped['status_counts']['done'] !== 1) throw new RuntimeException('Page counts failed.');
    }
    if (array_column(listing(['order' => 'invalid', 'group' => 'invalid'])['issues'], 'number') !== [1, 2, 3, 4]) throw new RuntimeException('Safe default failed.');
    $filtered = listing(['path' => '/?page_id=2&view=full', 'status' => 'todo', 'search' => 'Issue']);
    if ($filtered['total'] !== 1 || $filtered['status_counts']['done'] !== 1) throw new RuntimeException('Scope/search/status counts failed.');
    $tied = $fixture['items'][0]; $tied['number'] = 5; $tied['id'] = 'tie'; FeedbackPress\Service::$items[] = $tied;
    if (array_column(listing(['order' => 'created_desc'])['issues'], 'number') !== [4, 3, 2, 5, 1]) throw new RuntimeException('Creation tie unstable.');
    FeedbackPress\Service::$items = [];
    for ($n = 1; $n <= 125; $n++) { $i = $fixture['items'][0]; $i['number'] = $n; $i['id'] = (string) $n; FeedbackPress\Service::$items[] = $i; }
    $page = listing(['order' => 'created_desc', 'page' => 2]);
    if ($page['total'] !== 125 || count($page['issues']) !== 50 || $page['issues'][0]['number'] !== 75 || end($page['issues'])['number'] !== 26) throw new RuntimeException('Reverse pagination failed.');
    $focus = listing(['order' => 'created_desc', 'focus' => '1']);
    if ($focus['page'] !== 3 || end($focus['issues'])['number'] !== 1) throw new RuntimeException('Focus pagination failed.');
    echo "PASS Six real gateway sort orders, both groupings, exact-query page scope, null dates last, defaults/ties, scoped counts/search/status, reverse/focus pagination.\n";
}
