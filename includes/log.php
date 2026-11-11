<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Log {
    const KEY = 'feedbackpress_service_log_v2';
    public static function entries(): array { return array_values(array_filter((array) get_option(self::KEY, []), fn($r) => ($r['time'] ?? 0) >= time() - 3 * DAY_IN_SECONDS)); }
    public static function add(array $row): void {
        $rows = self::entries();
        $rows[] = array_intersect_key($row, array_flip(['operation', 'status', 'ms', 'error'])) + ['time' => time(), 'utc' => gmdate('Y-m-d\TH:i:s\Z')];
        $rows = array_slice($rows, -100);
        update_option(self::KEY, $rows, false);
    }
}
