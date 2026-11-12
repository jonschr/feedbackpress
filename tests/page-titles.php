<?php
// Standalone resolver fixture; no database, network or WordPress writes.
define('ABSPATH', __DIR__);
require dirname(__DIR__) . '/includes/service.php';
$home = 'https://qa.test:8453'; $front = 'posts'; $resolved = [];
$posts = [2 => (object) ['post_title' => 'Sample <em>Page</em> &amp; details', 'public' => true, 'post_password' => ''], 3 => (object) ['post_title' => 'Secret', 'public' => false, 'post_password' => ''], 4 => (object) ['post_title' => 'Password page', 'public' => true, 'post_password' => 'password']];
function home_url() { return $GLOBALS['home']; }
function wp_parse_url($url) { return parse_url($url); }
function untrailingslashit($url) { return rtrim($url, '/'); }
function get_option($key) { return $key === 'show_on_front' ? $GLOBALS['front'] : 2; }
function get_bloginfo($key) { return 'QA &amp; Co'; }
function wp_strip_all_tags($value) { return strip_tags($value); }
function url_to_postid($url) { $GLOBALS['resolved'][] = $url; $p = parse_url($url); parse_str($p['query'] ?? '', $q); return (int) ($q['page_id'] ?? $q['p'] ?? ($p['path'] === '/sample/' ? 2 : 0)); }
function get_post($id) { return $GLOBALS['posts'][$id] ?? null; }
function is_post_publicly_viewable($post) { return $post->public; }
function get_the_title($post) { return $post->post_title; }
function check_title($path, $expected) { $actual = FeedbackPress\Service::pageTitle($path); if ($actual !== $expected) throw new RuntimeException('Unexpected title for ' . $path); }
check_title('/', 'QA & Co'); $front = 'page'; check_title('/', 'Sample Page & details');
foreach (['/sample/', '/?page_id=2&view=full', '/?p=2'] as $path) check_title($path, 'Sample Page & details');
foreach (['/missing/', '/?page_id=3', '/?page_id=4', '/?page_id=999', '//other.test/', 'https://other.test/'] as $path) check_title($path, '');
$home = 'https://qa.test:8453/subdir'; check_title('/subdir/', 'Sample Page & details'); check_title('/subdir/?page_id=2&x=1&x=2', 'Sample Page & details');
if (end($resolved) !== 'https://qa.test:8453/subdir/?page_id=2&x=1&x=2') throw new RuntimeException('Site origin, subdirectory or query changed.');
echo "PASS Local page title resolver: homepage/front page, permalinks/query IDs, port/subdirectory, entities, unavailable/private/password pages, external URL rejection.\n";
