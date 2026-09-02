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

function view(string $name, array $vars = []): string
{
    extract($vars, EXTR_SKIP);
    ob_start();
    require base_dir() . '/templates/' . $name . '.php';
    return (string) ob_get_clean();
}

/** Render a page inside the layout and stop. */
function respond(array $store, string $title, string $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo view('layout', ['store' => $store, 'title' => $title, 'body' => $body]);
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
