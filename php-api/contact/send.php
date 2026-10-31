<?php

declare(strict_types=1);

require_once __DIR__ . '/rate-limit.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function contactResponse(string $code, int $status): never
{
    http_response_code($status);
    echo json_encode(['code' => $code], JSON_THROW_ON_ERROR);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    contactResponse('method', 405);
}
// JSON requires a browser preflight for cross-origin submissions; no CORS is granted.
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
    contactResponse('invalid', 415);
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $authority = is_string($originHost) ? $originHost . ($originPort ? ':' . $originPort : '') : '';
    if (strtolower($authority) !== strtolower($_SERVER['HTTP_HOST'] ?? '')) contactResponse('invalid', 403);
}
$raw = file_get_contents('php://input', false, null, 0, 32769);
if ($raw === false || strlen($raw) > 32768) contactResponse('invalid', 413);
try { $input = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
catch (JsonException) { contactResponse('invalid', 400); }
if (!is_array($input)) contactResponse('invalid', 400);
foreach (['name', 'email', 'subject', 'message', 'website'] as $key) {
    if (!is_string($input[$key] ?? null) || preg_match('//u', $input[$key]) !== 1) contactResponse('invalid', 400);
}
if (trim($input['website']) !== '') contactResponse('invalid', 400);
$fields = [];
foreach (['name' => 100, 'email' => 254, 'subject' => 160, 'message' => 5000] as $key => $maximum) {
    $value = trim($input[$key]);
    $length = preg_match_all('/./us', $value);
    if ($value === '' || $length === false || $length > $maximum) contactResponse('invalid', 400);
    $controlPattern = $key === 'message' ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u';
    if (preg_match($controlPattern, $value)) contactResponse('invalid', 400);
    $fields[$key] = $value;
}
if (strlen($fields['email']) > 254 || filter_var($fields['email'], FILTER_VALIDATE_EMAIL) === false) {
    contactResponse('invalid', 400);
}

try {
    $retry = contactRateLimit($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    if ($retry > 0) {
        header('Retry-After: ' . $retry);
        contactResponse('rate', 429);
    }
    if (!function_exists('mail')) contactResponse('unavailable', 503);

    // UTF-8 encoded words are folded by us; visitor-supplied header controls are rejected above.
    $words = [];
    $chunk = '';
    foreach (preg_split('//u', $fields['subject'], -1, PREG_SPLIT_NO_EMPTY) as $character) {
        if (strlen($chunk . $character) > 42) {
            $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
            $chunk = '';
        }
        $chunk .= $character;
    }
    if ($chunk !== '') $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
    $subject = implode("\r\n ", $words);
    $body = "From: {$fields['name']}\nEmail: {$fields['email']}\n\nMessage:\n{$fields['message']}\n";
    $accepted = @mail('business@jegprofil.info', $subject, chunk_split(base64_encode($body)), [
        'From' => 'JM Authenticator <business@jegprofil.info>',
        'Reply-To' => $fields['email'],
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'base64',
    ]);
    if (!$accepted) contactResponse('unavailable', 503);
    contactResponse('accepted', 200);
} catch (Throwable) {
    // Never include submitted text, transport diagnostics or filesystem paths in responses.
    contactResponse('unavailable', 503);
}
