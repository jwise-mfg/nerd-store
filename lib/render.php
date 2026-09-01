<?php
declare(strict_types=1);

function e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
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
