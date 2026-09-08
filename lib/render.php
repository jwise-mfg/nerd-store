<?php
declare(strict_types=1);

function e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * A ?v= stamp from the file's modification time.
 *
 * nginx serves stylesheets with `expires 30d`, which is right for a file that
 * rarely changes and wrong for one that just did: without this, an edit is
 * invisible to anyone who has already loaded the page until the cache expires.
 * The stamp changes when the file does, so the browser refetches exactly then.
 */
function asset_version(string $path): string
{
    $t = @filemtime($path);
    return $t ? '?v=' . $t : '';
}

/**
 * The parent site's menu bar, fetched server-side and inlined into the page.
 *
 * www.webosarchive.org sends no CORS headers, so a browser cannot fetch
 * menu.php across origins, and an iframe is not integration. PHP fetches it
 * instead and the markup lands in the page as if it were ours -- the same
 * way docs.webosarchive.org does it. Fetched over the protocol this request
 * arrived on, so the stylesheet and script links menu.php writes match the
 * page they land in.
 *
 * The URL in the store's config is protocol-relative ("//www...") for that
 * reason. Empty string on a store with no parent menu, or when the fetch
 * fails: the shop still renders, only without the bar. The timeout is what
 * keeps a slow parent site from making every shop page slow.
 */
function site_menu(array $store): string
{
    $url = $store['site_menu'] ?? null;
    if (!$url) {
        return '';
    }
    $https = ($_SERVER['HTTPS'] ?? '') === 'on'
        || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $ctx  = stream_context_create(['http' => ['timeout' => 3]]);
    $html = @file_get_contents(($https ? 'https:' : 'http:') . $url, false, $ctx);
    return $html === false ? '' : trim($html);
}

function view(string $name, array $vars = []): string
{
    extract($vars, EXTR_SKIP);
    ob_start();
    require base_dir() . '/templates/' . $name . '.php';
    return (string) ob_get_clean();
}

/**
 * Render a page inside the layout and stop.
 *
 * $meta is what a link preview shows -- LinkedIn, Slack, iMessage all read
 * the same Open Graph tags. Keys: description, image (absolute URL), url.
 * Pages that pass nothing get the store's own description and image.
 */
function respond(array $store, string $title, string $body, int $status = 200, array $meta = []): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo view('layout', ['store' => $store, 'title' => $title, 'body' => $body, 'meta' => $meta]);
    exit;
}

function redirect(string $to, int $status = 303): never
{
    http_response_code($status);
    header('Location: ' . $to);
    exit;
}

function not_found(array $store): never
{
    respond($store, 'Not found', view('notfound', ['store' => $store]), 404);
}
