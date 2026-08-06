<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/MarketData.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET,POST,OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function jsonResponse(array $body, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
}

function shouldHideErrorDetails(): bool
{
    $nodeEnv = getenv('NODE_ENV');
    $appEnv = getenv('APP_ENV');
    return $nodeEnv === 'production' || $appEnv === 'production';
}

function getJsonRequestBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

if ($method === 'GET' && $path === '/health') {
    jsonResponse(['ok' => true, 'time' => gmdate('c')]);
    exit;
}

if ($method === 'POST' && $path === '/api/quotes') {
    try {
        $body = getJsonRequestBody();
        $tickers = MarketData::sanitizeTickers($body['tickers'] ?? []);
        if ($tickers === []) {
            jsonResponse(['error' => 'Provide tickers: ["AAPL","MSFT","DRO.AX","SFTBF","NVDA"]'], 400);
            exit;
        }

        $payload = MarketData::fetchQuotes(MarketData::expandRelatedTickers($tickers));
        $received = [];
        foreach ($payload['quotes'] as $quote) {
            if (isset($quote['ticker'])) {
                $received[] = $quote['ticker'];
            }
        }

        jsonResponse([
            'requested' => $tickers,
            'received' => $received,
            'failed' => $payload['failed'],
            'quotes' => $payload['quotes'],
            'serverTime' => gmdate('c'),
        ]);
    } catch (Throwable $error) {
        jsonResponse([
            'error' => 'Failed to fetch quotes',
            'details' => shouldHideErrorDetails() ? null : $error->getMessage(),
        ], 500);
    }
    exit;
}

if ($method === 'GET' && preg_match('#^/api/resolve/([^/]+)$#', $path, $matches) === 1) {
    try {
        $candidateTicker = urldecode($matches[1]);
        $tickers = MarketData::sanitizeTickers([$candidateTicker]);
        if ($tickers === []) {
            jsonResponse(['error' => 'Ticker is required'], 400);
            exit;
        }

        jsonResponse(MarketData::resolveTicker($tickers[0]) + ['serverTime' => gmdate('c')]);
    } catch (Throwable $error) {
        jsonResponse([
            'error' => 'Ticker does not exist or is not supported',
            'details' => shouldHideErrorDetails() ? null : $error->getMessage(),
        ], 404);
    }
    exit;
}

if ($method === 'GET' && preg_match('#^/api/history/([^/]+)$#', $path, $matches) === 1) {
    try {
        $candidateTicker = urldecode($matches[1]);
        $tickers = MarketData::sanitizeTickers([$candidateTicker]);
        $ticker = $tickers[0] ?? '';

        if ($ticker === '') {
            jsonResponse(['error' => 'Ticker is required'], 400);
            exit;
        }

        $range = MarketData::sanitizeHistoryRange($_GET['range'] ?? null);
        $history = MarketData::fetchTickerHistory($ticker, $range);

        jsonResponse($history + ['serverTime' => gmdate('c')]);
    } catch (Throwable $error) {
        jsonResponse([
            'error' => 'Failed to fetch history',
            'details' => shouldHideErrorDetails() ? null : $error->getMessage(),
        ], 500);
    }
    exit;
}

if ($method === 'GET' && $path === '/api/fx') {
    try {
        $raw = $_GET['currencies'] ?? [];
        $list = [];

        if (is_array($raw)) {
            foreach ($raw as $value) {
                foreach (explode(',', (string) $value) as $part) {
                    $list[] = $part;
                }
            }
        } else {
            foreach (explode(',', (string) $raw) as $part) {
                $list[] = $part;
            }
        }

        $currencies = MarketData::sanitizeCurrencies($list);
        $fx = MarketData::fetchFxRatesToEur($currencies);

        jsonResponse([
            'base' => 'EUR',
            'requested' => $currencies,
            'rates' => $fx['rates'],
            'failed' => $fx['failed'],
            'serverTime' => gmdate('c'),
        ]);
    } catch (Throwable $error) {
        jsonResponse([
            'error' => 'Failed to fetch FX rates',
            'details' => shouldHideErrorDetails() ? null : $error->getMessage(),
        ], 500);
    }
    exit;
}

jsonResponse(['error' => 'Not found'], 404);
