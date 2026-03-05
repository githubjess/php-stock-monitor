<?php

declare(strict_types=1);

final class MarketData
{
    private const MAX_TICKERS = 50;
    private const MAX_CURRENCIES = 25;
    private const MAX_HISTORY_POINTS = 300;
    private const HISTORY_RANGE_CONFIG = [
        '1d' => ['range' => '1d', 'interval' => '5m'],
        '1w' => ['range' => '5d', 'interval' => '30m'],
        '1m' => ['range' => '1mo', 'interval' => '30m'],
        '2m' => ['range' => '2mo', 'interval' => '1h'],
        '3m' => ['range' => '3mo', 'interval' => '1d'],
        '6m' => ['range' => '6mo', 'interval' => '1d'],
        '1y' => ['range' => '1y', 'interval' => '1d'],
        '5y' => ['range' => '5y', 'interval' => '1wk'],
        'max' => ['range' => 'max', 'interval' => '1mo'],
    ];

    public static function sanitizeTickers($tickers): array
    {
        if (!is_array($tickers)) {
            return [];
        }

        $cleaned = [];
        foreach ($tickers as $ticker) {
            $value = self::normalizeTicker($ticker);
            if ($value !== '') {
                $cleaned[] = $value;
            }
        }

        return array_slice(array_values(array_unique($cleaned)), 0, self::MAX_TICKERS);
    }

    public static function sanitizeCurrencies($currencies): array
    {
        if (!is_array($currencies)) {
            return [];
        }

        $cleaned = [];
        foreach ($currencies as $currency) {
            $value = self::normalizeCurrency($currency);
            if (preg_match('/^[A-Z]{3}$/', $value) === 1) {
                $cleaned[] = $value;
            }
        }

        return array_slice(array_values(array_unique($cleaned)), 0, self::MAX_CURRENCIES);
    }

    public static function sanitizeHistoryRange($range): string
    {
        $value = strtolower(trim((string) ($range ?? '')));
        return array_key_exists($value, self::HISTORY_RANGE_CONFIG) ? $value : '1m';
    }

    public static function fetchQuotes(array $tickers): array
    {
        if ($tickers === []) {
            return ['quotes' => [], 'failed' => []];
        }

        $quotes = [];
        $failed = [];

        foreach ($tickers as $ticker) {
            try {
                $quotes[] = self::fetchChartQuote($ticker);
            } catch (Throwable $error) {
                $failed[] = [
                    'ticker' => $ticker,
                    'error' => self::getErrorMessage($error),
                ];
            }
        }

        return ['quotes' => $quotes, 'failed' => $failed];
    }

    public static function fetchTickerHistory(string $ticker, ?string $rangeKey): array
    {
        $normalizedTicker = self::normalizeTicker($ticker);
        if ($normalizedTicker === '') {
            throw new RuntimeException('Ticker is required');
        }

        $key = self::sanitizeHistoryRange($rangeKey);
        $config = self::HISTORY_RANGE_CONFIG[$key];
        $result = self::fetchChartResult($normalizedTicker, $config['interval'], $config['range']);

        $meta = isset($result['meta']) && is_array($result['meta']) ? $result['meta'] : [];
        $timestamps = isset($result['timestamp']) && is_array($result['timestamp']) ? $result['timestamp'] : [];

        $quote = [];
        if (
            isset($result['indicators']) &&
            is_array($result['indicators']) &&
            isset($result['indicators']['quote'][0]) &&
            is_array($result['indicators']['quote'][0])
        ) {
            $quote = $result['indicators']['quote'][0];
        }
        $closes = isset($quote['close']) && is_array($quote['close']) ? $quote['close'] : [];

        $points = [];
        $length = min(count($timestamps), count($closes));

        for ($i = 0; $i < $length; $i++) {
            $close = $closes[$i];
            $ts = $timestamps[$i];

            if (!is_numeric($close) || !is_finite((float) $close)) {
                continue;
            }
            if (!is_numeric($ts) || !is_finite((float) $ts)) {
                continue;
            }

            $points[] = [
                'time' => self::toIsoFromEpoch((int) $ts),
                'close' => (float) $close,
            ];
        }

        return [
            'ticker' => isset($meta['symbol']) ? (string) $meta['symbol'] : $normalizedTicker,
            'name' => isset($meta['shortName']) ? (string) $meta['shortName'] : (isset($meta['longName']) ? (string) $meta['longName'] : null),
            'currency' => isset($meta['currency']) ? (string) $meta['currency'] : null,
            'range' => $key,
            'points' => self::limitHistoryPoints($points),
        ];
    }

    public static function fetchFxRatesToEur(array $currencies): array
    {
        $normalized = self::sanitizeCurrencies($currencies);
        if ($normalized === []) {
            return ['rates' => ['EUR' => 1.0], 'failed' => []];
        }

        $rates = ['EUR' => 1.0];
        $failed = [];

        foreach ($normalized as $currency) {
            try {
                $rates[$currency] = self::fetchFxRateToEur($currency);
            } catch (Throwable $error) {
                $failed[] = [
                    'currency' => $currency,
                    'error' => self::getErrorMessage($error),
                ];
            }
        }

        return ['rates' => $rates, 'failed' => $failed];
    }

    private static function normalizeTicker($ticker): string
    {
        return preg_replace('/\s+/', '', strtoupper(trim((string) $ticker))) ?? '';
    }

    private static function normalizeCurrency($currency): string
    {
        return strtoupper(trim((string) $currency));
    }

    private static function getErrorMessage(Throwable $error): string
    {
        $message = $error->getMessage();
        return $message !== '' ? $message : 'Unknown symbol error';
    }

    private static function toIsoFromEpoch($epochSeconds): ?string
    {
        if (!is_numeric($epochSeconds) || !is_finite((float) $epochSeconds)) {
            return null;
        }

        return gmdate('c', (int) $epochSeconds);
    }

    private static function limitHistoryPoints(array $points, int $maxPoints = self::MAX_HISTORY_POINTS): array
    {
        if (count($points) <= $maxPoints) {
            return $points;
        }

        $sampled = [];
        $lastIndex = count($points) - 1;
        $denominator = $maxPoints - 1;

        for ($i = 0; $i < $maxPoints; $i++) {
            $index = (int) round(($i / $denominator) * $lastIndex);
            $sampled[] = $points[$index];
        }

        return $sampled;
    }

    private static function buildYahooChartUrl(string $ticker, string $interval, string $range): string
    {
        return sprintf(
            'https://query2.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s',
            rawurlencode($ticker),
            rawurlencode($interval),
            rawurlencode($range)
        );
    }

    private static function fetchChartResult(string $ticker, string $interval, string $range): array
    {
        $url = self::buildYahooChartUrl($ticker, $interval, $range);
        $json = self::httpGetJson($url);

        $chartError = null;
        if (isset($json['chart']) && is_array($json['chart']) && isset($json['chart']['error'])) {
            $chartError = $json['chart']['error'];
        }

        if (is_array($chartError) && $chartError !== []) {
            $description = isset($chartError['description']) ? (string) $chartError['description'] : '';
            $code = isset($chartError['code']) ? (string) $chartError['code'] : '';
            throw new RuntimeException($description !== '' ? $description : ($code !== '' ? $code : 'Yahoo chart error'));
        }

        $result = null;
        if (
            isset($json['chart']) &&
            is_array($json['chart']) &&
            isset($json['chart']['result'][0]) &&
            is_array($json['chart']['result'][0])
        ) {
            $result = $json['chart']['result'][0];
        }

        if (
            !is_array($result) ||
            !isset($result['meta']) ||
            !is_array($result['meta']) ||
            empty($result['meta']['symbol'])
        ) {
            throw new RuntimeException('Symbol not found or unsupported');
        }

        return $result;
    }

    private static function fetchChartQuote(string $ticker): array
    {
        $result = self::fetchChartResult($ticker, '1d', '5d');
        $meta = isset($result['meta']) && is_array($result['meta']) ? $result['meta'] : [];

        $price = isset($meta['regularMarketPrice']) && is_numeric($meta['regularMarketPrice']) ? (float) $meta['regularMarketPrice'] : null;
        $prevClose = null;
        if (isset($meta['chartPreviousClose']) && is_numeric($meta['chartPreviousClose'])) {
            $prevClose = (float) $meta['chartPreviousClose'];
        } elseif (isset($meta['previousClose']) && is_numeric($meta['previousClose'])) {
            $prevClose = (float) $meta['previousClose'];
        }

        $change = null;
        $changePercent = null;
        if ($price !== null && $prevClose !== null && $prevClose != 0.0) {
            $change = $price - $prevClose;
            $changePercent = ($change / $prevClose) * 100;
        }

        return [
            'ticker' => isset($meta['symbol']) ? (string) $meta['symbol'] : $ticker,
            'name' => isset($meta['shortName']) ? (string) $meta['shortName'] : (isset($meta['longName']) ? (string) $meta['longName'] : null),
            'currency' => isset($meta['currency']) ? (string) $meta['currency'] : null,
            'exchange' => isset($meta['fullExchangeName']) ? (string) $meta['fullExchangeName'] : (isset($meta['exchangeName']) ? (string) $meta['exchangeName'] : null),
            'source' => 'Yahoo Finance chart API',
            'priceType' => 'regularMarketPrice',
            'price' => $price,
            'prevClose' => $prevClose,
            'change' => $change,
            'changePercent' => $changePercent,
            'marketTime' => self::toIsoFromEpoch($meta['regularMarketTime'] ?? null),
            'marketState' => isset($meta['marketState']) ? (string) $meta['marketState'] : null,
            'bid' => (isset($meta['bid']) && is_numeric($meta['bid'])) ? (float) $meta['bid'] : null,
            'ask' => (isset($meta['ask']) && is_numeric($meta['ask'])) ? (float) $meta['ask'] : null,
            'open' => (isset($meta['regularMarketOpen']) && is_numeric($meta['regularMarketOpen'])) ? (float) $meta['regularMarketOpen'] : null,
            'dayHigh' => (isset($meta['regularMarketDayHigh']) && is_numeric($meta['regularMarketDayHigh'])) ? (float) $meta['regularMarketDayHigh'] : null,
            'dayLow' => (isset($meta['regularMarketDayLow']) && is_numeric($meta['regularMarketDayLow'])) ? (float) $meta['regularMarketDayLow'] : null,
            'volume' => (isset($meta['regularMarketVolume']) && is_numeric($meta['regularMarketVolume'])) ? (float) $meta['regularMarketVolume'] : null,
            'averageVolume' => (isset($meta['averageDailyVolume3Month']) && is_numeric($meta['averageDailyVolume3Month']))
                ? (float) $meta['averageDailyVolume3Month']
                : ((isset($meta['averageDailyVolume10Day']) && is_numeric($meta['averageDailyVolume10Day'])) ? (float) $meta['averageDailyVolume10Day'] : null),
            'marketCap' => (isset($meta['marketCap']) && is_numeric($meta['marketCap'])) ? (float) $meta['marketCap'] : null,
            'fiftyTwoWeekHigh' => (isset($meta['fiftyTwoWeekHigh']) && is_numeric($meta['fiftyTwoWeekHigh'])) ? (float) $meta['fiftyTwoWeekHigh'] : null,
            'fiftyTwoWeekLow' => (isset($meta['fiftyTwoWeekLow']) && is_numeric($meta['fiftyTwoWeekLow'])) ? (float) $meta['fiftyTwoWeekLow'] : null,
        ];
    }

    private static function fetchFxRateToEur(string $baseCurrency): float
    {
        $base = self::normalizeCurrency($baseCurrency);
        if ($base === '') {
            throw new RuntimeException('Currency is required');
        }

        if ($base === 'EUR') {
            return 1.0;
        }

        $pairTicker = $base . 'EUR=X';
        $result = self::fetchChartResult($pairTicker, '1d', '5d');
        $meta = isset($result['meta']) && is_array($result['meta']) ? $result['meta'] : [];

        $rate = null;
        if (isset($meta['regularMarketPrice']) && is_numeric($meta['regularMarketPrice'])) {
            $rate = (float) $meta['regularMarketPrice'];
        } elseif (isset($meta['chartPreviousClose']) && is_numeric($meta['chartPreviousClose'])) {
            $rate = (float) $meta['chartPreviousClose'];
        } elseif (isset($meta['previousClose']) && is_numeric($meta['previousClose'])) {
            $rate = (float) $meta['previousClose'];
        }

        if ($rate === null || !is_finite($rate) || $rate <= 0) {
            throw new RuntimeException('No EUR rate for ' . $base);
        }

        return $rate;
    }

    private static function httpGetJson(string $url): array
    {
        $userAgent = 'stock-monitor-php/1.0';
        $hasCurl = function_exists('curl_init');
        $hasHttpsStream = in_array('https', stream_get_wrappers(), true);

        if (!$hasCurl && !$hasHttpsStream) {
            throw new RuntimeException('HTTPS requests are unavailable in this PHP build. Enable cURL or OpenSSL support.');
        }

        if ($hasCurl) {
            $ch = curl_init($url);
            if ($ch === false) {
                throw new RuntimeException('Failed to initialize cURL');
            }

            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => ['User-Agent: ' . $userAgent],
            ]);
            if (defined('CURLOPT_SSL_OPTIONS') && defined('CURLSSLOPT_NATIVE_CA')) {
                curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
            }

            $body = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);

            if ($body === false) {
                throw new RuntimeException('HTTP request failed: ' . ($curlError !== '' ? $curlError : 'Unknown cURL error'));
            }

            if ($status < 200 || $status >= 300) {
                throw new RuntimeException('Yahoo chart request failed (' . $status . ')');
            }
        } else {
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'header' => "User-Agent: {$userAgent}\r\n",
                    'ignore_errors' => true,
                    'timeout' => 15,
                ],
            ]);

            $body = @file_get_contents($url, false, $context);
            if ($body === false) {
                $lastError = error_get_last();
                $message = is_array($lastError) && isset($lastError['message']) ? (string) $lastError['message'] : 'HTTP request failed';
                throw new RuntimeException($message);
            }

            $status = 0;
            $responseHeaders = function_exists('http_get_last_response_headers')
                ? http_get_last_response_headers()
                : [];
            if (is_array($responseHeaders) && isset($responseHeaders[0]) && preg_match('/\s(\d{3})\s/', (string) $responseHeaders[0], $matches) === 1) {
                $status = (int) $matches[1];
            }

            if ($status < 200 || $status >= 300) {
                throw new RuntimeException('Yahoo chart request failed (' . $status . ')');
            }
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Invalid response from Yahoo Finance');
        }

        return $decoded;
    }
}
