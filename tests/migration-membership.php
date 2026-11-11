<?php
// Disposable B fixture; FEEDBACKPRESS_QA_SOURCE points to a private encoded A connection.
if (!str_contains(home_url(), 'feedbackpress-qa-b.localhost')) throw new RuntimeException('QA B fixture required.');
$source = trim(file_get_contents(getenv('FEEDBACKPRESS_QA_SOURCE')));
$from = FeedbackPress\Service::unpack($source); $original = FeedbackPress\Service::connection();
if (empty($from['manager']) || $from['account'] !== $original['account']) throw new RuntimeException('Same-account connected QA copies required.');
$home = FeedbackPress\Service::home(); $destination = wp_generate_uuid4(); $fresh = 'https://feedbackpress-qa-new-' . substr(wp_generate_uuid4(), 0, 8) . '.localhost:8453';
$filter = fn() => $fresh;
try {
    FeedbackPress\Service::manager('POST', '/projects', ['id' => $destination, 'name' => 'Migration destination ' . substr($destination, 0, 8)]);
    FeedbackPress\Service::selectProject($destination);
    update_option(FeedbackPress\Service::OPTION, $source, false);
    $known = FeedbackPress\Service::ensureConnection();
    if ($known['project'] !== $destination || $known['site_url'] !== $home) throw new RuntimeException('Copied source overwrote destination project.');
    update_option(FeedbackPress\Service::OPTION, $source, false);
    add_filter('home_url', $filter);
    $new = FeedbackPress\Service::ensureConnection();
    if ($new['project'] !== $from['project'] || $new['site_url'] !== $fresh) throw new RuntimeException('New URL did not join copied project.');
    $bytes = (string) get_option(FeedbackPress\Service::OPTION);
    if (str_contains($bytes, $fresh) || str_contains($bytes, $from['site_url'])) throw new RuntimeException('Encoded URLs exposed to literal replacement.');
    FeedbackPress\Service::snapshot();
    FeedbackPress\Service::removeSite($fresh);
    update_option(FeedbackPress\Service::OPTION, $source, false);
    $removed = FeedbackPress\Admin::state();
    if (empty($removed['disconnected'])) throw new RuntimeException('Removed URL automatically rejoined.');
    WP_CLI::success('Copied connection preserves known destination project, auto-registers a new URL, protects literal URLs, and respects removal.');
} finally {
    remove_filter('home_url', $filter);
    update_option(FeedbackPress\Service::OPTION, FeedbackPress\Service::pack($original), false);
    FeedbackPress\Service::selectProject($original['project']);
}
