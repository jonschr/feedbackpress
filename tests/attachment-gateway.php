<?php
// Run inside WordPress as an administrator. All service HTTP is intercepted; saved connections are unchanged.
defined('ABSPATH') || exit;
if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON', true);
require_once dirname(__DIR__) . '/feedbackpress.php';
use FeedbackPress\API;
use FeedbackPress\Service;
if (!current_user_can('manage_options')) throw new RuntimeException('An administrator is required for the intercepted gateway fixture.');
function attachment_assert($ok, $message) { if (!$ok) throw new RuntimeException($message); }
attachment_assert(API::MAX_FILE === 15728640, 'Upload limit must be exactly 15 MiB.');
$samples = [
    ["\xff\xd8\xffsynthetic", 'wrong.bin', 'image/jpeg'], ["\x89PNG\r\n\x1a\nsynthetic", 'wrong.bin', 'image/png'],
    ['RIFF0000WEBPsynthetic', 'image.webp', 'image/webp'], ['GIF89asynthetic', 'image.gif', 'image/gif'],
    ['BMsynthetic', 'image.bmp', 'image/bmp'], ["II\x2a\0synthetic", 'image.tif', 'image/tiff'],
    ["MM\0\x2asynthetic", 'image.tiff', 'image/tiff'], ['%PDF-1.7', 'image.jpg', 'application/pdf'],
    ["\0\0\0\x18ftypheic\0\0\0\0mif1", 'image.heic', 'image/heic'],
    ["\0\0\0\x18ftypmif1\0\0\0\0mif1", 'image.heif', 'image/heif'],
    ["\0\0\0\x18ftypavif\0\0\0\0mif1", 'image.avif', 'image/avif'],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'image.svg', 'image/svg+xml'],
    ['a,b' . "\n" . 'one,two', 'data.CSV', 'text/csv'], ['a' . "\t" . 'b' . "\n", 'data.tsv', 'text/tab-separated-values'],
    ["PK\x03\x04opaque", 'data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ["PK\x03\x04opaque", 'data.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
    ["PK\x03\x04opaque", 'data.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ["PK\x03\x04opaque", 'data.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ["\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1opaque", 'data.xls', 'application/vnd.ms-excel'],
];
$samples[] = ["\xff\xd8\xffsynthetic", 'photo.jfif', 'image/jpeg'];
$samples[] = [pack('V3v2V6', 40, 2, 2, 1, 24, 0, 16, 0, 0, 0, 0) . str_repeat(chr(100), 16), 'graphic.dib', 'image/bmp'];
foreach ($samples as [$bytes, $name, $mime]) attachment_assert(API::uploadMime($bytes, $name) === $mime, 'Canonical MIME classification failed for ' . $name);
foreach (['data.xlsm', 'data.docm', 'data.pptm', 'archive.zip', 'text.exe'] as $name) {
    try { API::uploadMime("PK\x03\x04opaque", $name); throw new RuntimeException('Unsupported format was accepted: ' . $name); }
    catch (InvalidArgumentException $e) { attachment_assert(str_contains($e->getMessage(), 'Macro-enabled and encrypted'), 'Unsupported-file explanation missing.'); }
}
$original = get_option(Service::OPTION);
$project = '11111111-1111-4111-8111-111111111111'; $media = '22222222-2222-4222-8222-222222222222';
$connection = fn() => Service::pack(['v' => 3, 'service' => 'https://attachments.example.test', 'project' => $project, 'token' => 'fixture-only-token', 'site_url' => Service::home()]);
$settings = fn() => ['mode' => 'admins']; $calls = []; $remoteFailure = null;
$http = function ($pre, $args, $url) use (&$calls, &$remoteFailure, $project, $media) {
    attachment_assert(str_starts_with($url, 'https://attachments.example.test/v1/projects/' . $project . '/'), 'Unexpected external request.');
    $calls[] = ['url' => $url] + $args;
    if ($remoteFailure) return ['response' => ['code' => $remoteFailure['status']], 'headers' => ['retry-after' => $remoteFailure['retry'] ?? ''], 'body' => wp_json_encode(['error' => $remoteFailure['error']])];
    return ['response' => ['code' => 200], 'headers' => ['content-type' => str_ends_with($url, '/preview') ? 'image/png' : 'image/svg+xml', 'content-disposition' => 'attachment; filename="fixture.svg"'], 'body' => $args['method'] === 'GET' ? 'fixture bytes' : '{"ok":true}'];
};
add_filter('pre_option_' . Service::OPTION, $connection); add_filter('pre_option_feedbackpress_settings', $settings); add_filter('pre_http_request', $http, 10, 3);
try {
    attachment_assert(FeedbackPress\frontend_config()['maxBytes'] === 15728640, 'Frontend upload limit must be exactly 15 MiB.');
    $samples[] = ["\xff\xd8\xffsynthetic", 'photo.jfif', 'image/jpeg'];
$samples[] = [pack('V3v2V6', 40, 2, 2, 1, 24, 0, 16, 0, 0, 0, 0) . str_repeat(chr(100), 16), 'graphic.dib', 'image/bmp'];
foreach ($samples as [$bytes, $name, $mime]) {
        Service::request('PUT', '/media/' . $media, $bytes, '', false, null, false, $mime);
        $call = end($calls);
        attachment_assert($call['headers']['Content-Type'] === $mime && $call['body'] === $bytes, 'Raw upload bytes or reserved MIME changed for ' . $name);
        attachment_assert($call['timeout'] === 60, 'Upload timeout does not cover the bounded conversion window.');
    }
    Service::request('POST', '/fixture', ['text' => 'preserved']);
    attachment_assert(end($calls)['headers']['Content-Type'] === 'application/json', 'Normal requests lost JSON handling.');
    attachment_assert(end($calls)['timeout'] === 25, 'Non-upload timeout changed.');
    foreach ([['POST', '/media/' . $media, 'image/png'], ['PUT', '/fixture', 'image/png'], ['PUT', '/media/' . $media, 'text/html']] as [$method, $path, $mime]) {
        $count = count($calls);
        try { Service::request($method, $path, 'bytes', '', false, null, false, $mime); throw new RuntimeException('Invalid MIME override accepted.'); }
        catch (InvalidArgumentException $e) { attachment_assert(count($calls) === $count, 'Invalid MIME override reached HTTP.'); }
    }
    foreach (['', '/preview'] as $suffix) {
        $request = new WP_REST_Request('GET', '/feedbackpress/v1/files/' . $media . $suffix); $request->set_header('X-FeedbackPress-Actor', 'forged-browser-actor');
        $response = rest_do_request($request); $call = end($calls);
        attachment_assert($response->get_status() === 200 && $response->get_data() === 'fixture bytes', 'Attachment gateway bytes failed.');
        attachment_assert($call['url'] === 'https://attachments.example.test/v1/projects/' . $project . '/media/' . $media . $suffix, 'Attachment gateway route changed.');
        $actor = Service::unpack($call['headers']['X-FeedbackPress-Actor'] ?? '');
        attachment_assert(($actor['email'] ?? '') === strtolower(wp_get_current_user()->user_email) && $call['headers']['Authorization'] === 'Bearer fixture-only-token', 'Gateway did not retain server-resolved authorization.');
        attachment_assert(($response->get_headers()['X-Content-Type-Options'] ?? '') === 'nosniff' && str_contains($response->get_headers()['Content-Security-Policy'] ?? '', 'sandbox'), 'Attachment security headers missing.');
        $response = apply_filters('rest_post_dispatch', $response, rest_get_server(), $request);
        attachment_assert(str_contains($response->get_headers()['Cache-Control'] ?? '', 'no-store'), 'Attachment gateway allowed public caching.');
    }
    foreach ([['status' => 429, 'error' => 'media_processing_busy'], ['status' => 429, 'error' => 'media_processing_busy', 'retry' => '7'], ['status' => 415, 'error' => 'invalid_document'], ['status' => 413, 'error' => 'file_size_limit'], ['status' => 503, 'error' => 'media_workspace_unavailable']] as $remoteFailure) {
        $request = new WP_REST_Request('GET', '/feedbackpress/v1/files/' . $media . '/preview');
        $response = rest_do_request($request); $data = $response->get_data();
        attachment_assert($response->get_status() === $remoteFailure['status'] && !str_contains($data['message'], 'request failed'), 'Attachment error did not have a readable explanation.');
        if ($remoteFailure['status'] === 429) {
            $expected = (int) ($remoteFailure['retry'] ?? 5); $response = apply_filters('rest_post_dispatch', $response, rest_get_server(), $request);
            attachment_assert(($data['data']['retry_after'] ?? 0) === $expected && ($response->get_headers()['Retry-After'] ?? '') === (string) $expected, 'Processing concurrency retry delay was lost.');
        }
    }
    $remoteFailure = null;
    $actor = get_current_user_id(); wp_set_current_user(0);
    $count = count($calls); $response = rest_do_request(new WP_REST_Request('GET', '/feedbackpress/v1/files/' . $media . '/preview'));
    attachment_assert($response->get_status() === 403 && count($calls) === $count, 'Unauthorized preview reached the service.'); wp_set_current_user($actor);
} finally {
    if (isset($actor)) wp_set_current_user($actor);
    remove_filter('pre_option_' . Service::OPTION, $connection); remove_filter('pre_option_feedbackpress_settings', $settings); remove_filter('pre_http_request', $http, 10);
}
attachment_assert(get_option(Service::OPTION) === $original, 'Saved connection changed.');
echo "PASS Canonical MIME/signatures, 15 MiB config, unparsed container forwarding, raw MIME/body consistency, restricted overrides, authorized private preview/download gateway, readable conversion errors, busy Retry-After forwarding/fallback, forged identity resistance and unchanged saved connection.\n";
