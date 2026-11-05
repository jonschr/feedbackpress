<?php
namespace FeedbackPress;
defined('ABSPATH') || exit;

function boot_update_checker(): void {
    $file = dirname(__DIR__) . '/vendor/plugin-update-checker/plugin-update-checker.php';
    if (!is_file($file)) return;
    require_once $file;
    if (!class_exists('\\YahnisElsts\\PluginUpdateChecker\\v5\\PucFactory')) return;
    \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
        'https://raw.githubusercontent.com/jonschr/feedbackpress/main/update.json',
        dirname(__DIR__) . '/feedbackpress.php',
        'feedbackpress'
    );
}
add_action('plugins_loaded', __NAMESPACE__ . '\\boot_update_checker', 5);
