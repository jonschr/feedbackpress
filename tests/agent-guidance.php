<?php
// Use --skip-plugins=feedbackpress --require=this-file --user=<admin> eval-file this-file.
// Load source before the MCP adapter discovers abilities; no installed plugin changes.
if (!defined('ABSPATH')) {
    if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON', true);
    $GLOBALS['wp_filter']['muplugins_loaded'][10][] = ['function' => static function () {
        require_once dirname(__DIR__) . '/feedbackpress.php';
        remove_action('plugins_loaded', 'FeedbackPress\\boot_update_checker', 5);
    }, 'accepted_args' => 0];
    return;
}
if (!current_user_can('manage_options')) throw new RuntimeException('Select an administrator');
$admin = wp_get_current_user();
$connection = ['project' => '11111111-1111-4111-8111-111111111111', 'token' => 'fp_synthetic', 'site_url' => FeedbackPress\Service::home()];
$mode = 'admins'; $http = 0;
add_filter('pre_option_' . FeedbackPress\Service::OPTION, function () use (&$connection) { return FeedbackPress\Service::pack($connection); });
add_filter('pre_option_feedbackpress_settings', function () use (&$mode) { return ['mode' => $mode]; });
add_filter('pre_http_request', function () use (&$http) { $http++; return new WP_Error('fixture_http', 'Test HTTP blocked'); });
$assert = function ($ok) { if (!$ok) throw new RuntimeException('Agent guidance assertion failed'); };
$ability = wp_get_ability('feedbackpress/agent-guidance');
$assert($ability instanceof WP_Ability);
$meta = $ability->get_meta(); $assert($meta['mcp']['public'] && $meta['annotations']['readonly']);
$guide = $ability->execute([]);
if (is_wp_error($guide)) throw new RuntimeException('Ability execution failed: ' . $guide->get_error_message());
$assert($guide['identity']['authenticated'] && $guide['identity']['wordpress_user_id'] === $admin->ID);
$assert(array_keys($guide['statuses']) === ['todo','doing','needs_info','review','done']);
$assert(str_contains($guide['notes']['agent_only_or_uncertain'], 'public reply') && str_contains($guide['workflow'][2], 'one or two short sentences'));
$assert(!str_contains(wp_json_encode($guide), 'fp_synthetic') && !isset($guide['identity']['email']));
$mcp = class_exists('WP\\MCP\\Abilities\\DiscoverAbilitiesAbility');
if ($mcp) {
    $discovered = WP\MCP\Abilities\DiscoverAbilitiesAbility::execute([]);
    $assert(in_array('feedbackpress/agent-guidance', array_column($discovered['abilities'], 'name'), true));
    $executed = WP\MCP\Abilities\ExecuteAbilityAbility::execute(['ability_name' => 'feedbackpress/agent-guidance', 'parameters' => []]);
    $assert($executed['success'] && isset($executed['data']['statuses']['done']));
}
$request = new WP_REST_Request('GET', '/feedbackpress/v1/agent-guidance');
$response = rest_do_request($request); $assert($response->get_status() === 200 && isset($response->get_data()['workflow']));
$mode = 'disabled'; $assert(is_wp_error($ability->execute([]))); $assert(rest_do_request($request)->get_status() === 403);
$mode = 'admins'; wp_set_current_user(0); $assert(is_wp_error($ability->execute([]))); $assert(rest_do_request($request)->get_status() === 403);
$generic = FeedbackPress\Agent::guidance(); $assert(!$generic['identity']['authenticated'] && $generic['identity']['name'] === null);
$mode = 'everyone'; $public = $ability->execute([]); $assert(!is_wp_error($public) && $public['identity']['private_note_access'] === 'None. A review link or guest name/email is not a private-note identity.');
$assert($http === 0); wp_set_current_user($admin->ID);
echo 'PASS real Abilities registration/execution, MCP ' . ($mcp ? 'discovery/execution verified' : 'adapter not active') . ", REST access modes, anonymous/private identity and secret-free guidance. No feedback or connection writes, no actual HTTP.\n";
