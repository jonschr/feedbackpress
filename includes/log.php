<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;
final class Log {
    const KEY = 'feedbackpress_sync_log_v1';
    public static function entries(): array {
        return array_values(array_filter(Network::unpack(get_option(self::KEY, '')), fn($row) => ($row['time'] ?? 0) >= time() - 3 * DAY_IN_SECONDS));
    }
    public static function add(array $row): void {
        $rows = self::entries();
        $rows[] = array_intersect_key($row, array_flip(['peer', 'url', 'operation', 'status', 'ms', 'error', 'reason', 'retry_at', 'events', 'files'])) + ['time' => time(), 'utc' => gmdate('Y-m-d\TH:i:s\Z')];
        $rows = array_slice($rows, -100);
        while (strlen(Network::pack($rows)) > 65536) array_shift($rows);
        update_option(self::KEY, Network::pack($rows), false);
    }
}
