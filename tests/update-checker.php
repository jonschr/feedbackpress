<?php
// WP-CLI: wp eval-file tests/update-checker.php
// Update AJAX boot: wp --require=tests/update-checker.php eval-file tests/update-checker.php
if (!defined('ABSPATH')) {
    define('DOING_AJAX', true);
    $_REQUEST['action'] = 'update-plugin';
    return;
}

$metadata = json_decode(file_get_contents(dirname(__DIR__) . '/update.json'), true, 512, JSON_THROW_ON_ERROR);
$plugin = dirname(__DIR__) . '/feedbackpress.php';
$headers = get_file_data($plugin, ['Version' => 'Version', 'UpdateURI' => 'Update URI']);
$beta = str_contains(FeedbackPress\VERSION, '-');
if ($headers['Version'] !== FeedbackPress\VERSION || (!$beta && $metadata['version'] !== FeedbackPress\VERSION)
    || ($beta && (str_contains($metadata['version'], '-') || version_compare($metadata['version'], FeedbackPress\VERSION, '>=')))
    || $headers['UpdateURI'] !== 'https://github.com/jonschr/feedbackpress'
    || $metadata['download_url'] !== 'https://github.com/jonschr/feedbackpress/releases/download/' . $metadata['version'] . '/feedbackpress-' . $metadata['version'] . '.zip') {
    throw new RuntimeException('Plugin header/runtime and the stable update channel policy must agree.');
}
$url = 'https://raw.githubusercontent.com/jonschr/feedbackpress/main/update.json';
$found = [];
foreach ($GLOBALS['wp_filter']['site_transient_update_plugins']->callbacks ?? [] as $callbacks) {
    foreach ($callbacks as $callback) {
        $handler = $callback['function'];
        if (is_array($handler) && is_object($handler[0]) && ($handler[0]->slug ?? null) === 'feedbackpress') $found[spl_object_id($handler[0])] = $handler[0];
    }
}
if (count($found) !== 1) throw new RuntimeException('FeedbackPress must register exactly one update checker.');
$checker = reset($found);
if ($checker->metadataUrl !== $url || $checker->pluginFile !== 'feedbackpress/feedbackpress.php') throw new RuntimeException('Incorrect updater endpoint or plugin basename.');

$body = $metadata;
$mock = static function ($pre, $args, $request_url) use ($url, &$body) {
    if (!str_starts_with($request_url, $url)) return $pre;
    return ['headers' => [], 'body' => wp_json_encode($body), 'response' => ['code' => 200, 'message' => 'OK'], 'cookies' => []];
};
add_filter('pre_http_request', $mock, 10, 3);
$state = $checker->getUpdateState();
$previous = $state->getUpdate();
$package = (new ReflectionProperty($checker, 'package'))->getValue($checker);
$versionCache = new ReflectionProperty($package, 'cachedInstalledVersion');
$installedVersion = $versionCache->getValue($package);
try {
    $update = $checker->requestUpdate();
    if (!$update || $update->version !== $metadata['version'] || $update->download_url !== $metadata['download_url']) throw new RuntimeException('Could not parse JSON update metadata.');
    $state->setUpdate($update);
    if ($checker->getUpdate() !== null) throw new RuntimeException('The current version must not offer itself as an update.');
    foreach (['0.2.2', '0.3.0-beta.7'] as $older) {
        $versionCache->setValue($package, $older);
        $offers = $checker->injectUpdate((object) ['response' => [], 'no_update' => []]);
        $offer = $offers->response[$checker->pluginFile] ?? null;
        if (!$offer || $offer->new_version !== $metadata['version'] || $offer->package !== $metadata['download_url']) throw new RuntimeException('Legacy and beta copies must receive the normal release from the existing feed.');
    }
    $versionCache->setValue($package, $installedVersion);
    $body['version'] = '9999.0.0';
    $body['download_url'] = 'https://example.invalid/feedbackpress-test.zip';
    $state->setUpdate($checker->requestUpdate());
    $updates = $checker->injectUpdate((object) ['response' => [], 'no_update' => []]);
    $offer = $updates->response[$checker->pluginFile] ?? null;
    if (!$offer || $offer->new_version !== $body['version'] || $offer->package !== $body['download_url'] || $offer->slug !== 'feedbackpress') throw new RuntimeException('A newer JSON release must reach the WordPress updates response.');
} finally {
    $versionCache->setValue($package, $installedVersion);
    $state->setUpdate($previous); // Keep synthetic update data in memory; never save it to WordPress.
    remove_filter('pre_http_request', $mock, 10);
}
echo 'PASS FeedbackPress JSON updates: stable-channel policy, single checker, plugin basename, current/legacy/beta/newer releases, and ' . (wp_doing_ajax() ? 'update AJAX' : 'WP-CLI') . " boot. No update installed.\n";
