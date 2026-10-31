<?php

declare(strict_types=1);

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if ($uriPath === '/contact/send.php') {
    require __DIR__ . '/contact/send.php';
    return true;
}
$publicPath = __DIR__ . '/public' . $uriPath;

if ($uriPath !== '/' && file_exists($publicPath) && !is_dir($publicPath)) {
    return false;
}

require __DIR__ . '/public/index.php';

