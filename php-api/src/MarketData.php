<?php

declare(strict_types=1);

require_once __DIR__ . '/ResponseCache.php';

final class MarketData
{
    private const MAX_TICKERS = 50;
    private const MAX_CURRENCIES = 25;
    private const MAX_HISTORY_POINTS = 300;
    private const SPARK_POINTS = 48;
    private const PARALLEL_REQUESTS = 10;
    private const CACHE_VERSION = 'v2';

    // Quotes use today's intraday chart: its previousClose is yesterday's close, and its
    // bars double as the watchlist sparkline. A 5-day chart reports the close before
    // the 5-day window instead, which overstated the daily change.
    private const QUOTE_CHART = ['range' => '1d', 'interval' => '5m'];

    private const RELATED_LISTING_GROUPS = [
        ['DRH.F', 'DRO.AX', 'DRSHF'],
        ['APC.F', 'AAPL'],
        ['MSF.F', 'MSFT'],
        ['NVD.F', 'NVDA'],
        ['ABEA.F', 'GOOGL'],
        ['TL0.F', 'TSLA'],
        ['INL.F', 'INTC'],
        ['SFT.F', '9984.T', 'SFTBF', 'SFTBY'],
        ['BCY.F', 'BARC.L', 'BCS'],
    ];
    private const HISTORY_RANGE_CONFIG = [
        '1d' => ['range' => '1d', 'interval' => '5m', 'ttl' => 60],
        '1w' => ['range' => '5d', 'interval' => '30m', 'ttl' => 300],
        '1m' => ['range' => '1mo', 'interval' => '30m', 'ttl' => 600],
        '2m' => ['range' => '2mo', 'interval' => '1h', 'ttl' => 900],
        '3m' => ['range' => '3mo', 'interval' => '1d', 'ttl' => 3600],
        '6m' => ['range' => '6mo', 'interval' => '1d', 'ttl' => 3600],
        '1y' => ['range' => '1y', 'interval' => '1d', 'ttl' => 3600],
        '5y' => ['range' => '5y', 'interval' => '1wk', 'ttl' => 21600],
        'max' => ['range' => 'max', 'interval' => '1mo', 'ttl' => 21600],
    ];
    private const QUOTE_TTL_OPEN = 15;
    private const QUOTE_TTL_CLOSED = 600;
    private const FX_TTL = 900;
    private const RESOLVE_TTL = 43200;

    public static function listingGroups(): array
    {
        return self::RELATED_LISTING_GROUPS;
    }

    public static function sanitizeTickers($tickers): array
    {
        if (!is_array($tickers)) {
            return [];
        }

        $cleaned = [];
        foreach ($tickers as $ticker) {
            $value = self::normalizeTicker($ticker);
            if ($value !== '' && preg_match('/^[A-Z0-9.\-=^]{1,20}$/', $value) === 1) {
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

    public static function expandRelatedTickers(array $tickers): array
    {
        $expanded = $tickers;

        foreach (self::RELATED_LISTING_GROUPS as $group) {
            if (array_intersect($tickers, $group) !== []) {
                $expanded = array_merge($expanded, $group);
            }
        }

        return array_slice(array_values(array_unique($expanded)), 0, self::MAX_TICKERS);
    }

    public static function resolveTicker(string $ticker): array
    {
        $normalizedTicker = self::normalizeTicker($ticker);
        if ($normalizedTicker === '') {
            throw new RuntimeException('Ticker is required');
        }

        $cacheKey = self::cacheKey('resolve', $normalizedTicker);
        $cached = ResponseCache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        $primaryQuote = self::fetchChartQuote($normalizedTicker);
        $companyName = (string) ($primaryQuote['name'] ?? $normalizedTicker);
        $candidateSymbols = self::expandRelatedTickers([$normalizedTicker]);
        $rootSymbol = preg_replace('/\..*$/', '', $normalizedTicker) ?? $normalizedTicker;
        $candidateSymbols[] = $rootSymbol;
        foreach (['.F', '.DE', '.MU', '.L', '.PA', '.MI', '.AS', '.SW', '.T', '.AX'] as $suffix) {
            $candidateSymbols[] = $rootSymbol . $suffix;
        }

        try {
            $searchCandidates = self::searchYahooEquities($companyName);
        } catch (Throwable $error) {
            $searchCandidates = [];
        }

        foreach ($searchCandidates as $candidate) {
            $symbol = self::normalizeTicker($candidate['symbol'] ?? '');
            $candidateName = (string) ($candidate['name'] ?? '');
            if (
                $symbol !== '' &&
                self::companyNamesMatch($companyName, $candidateName)
            ) {
                $candidateSymbols[] = $symbol;
            }
        }

        $candidates = self::sanitizeTickers(array_slice(array_values(array_unique($candidateSymbols)), 0, 20));
        $candidateQuotes = self::fetchQuotes($candidates)['quotes'];

        $verifiedByRegion = [];
        foreach ($candidateQuotes as $quote) {
            if (!self::companyNamesMatch($companyName, (string) ($quote['name'] ?? ''))) {
                continue;
            }

            $region = self::classifyListingRegion((string) $quote['ticker'], (string) ($quote['exchange'] ?? ''));
            if ($region === null) {
                continue;
            }
            $score = self::listingPreferenceScore((string) $quote['ticker'], $region);
            if (!isset($verifiedByRegion[$region]) || $score < $verifiedByRegion[$region]['score']) {
                $verifiedByRegion[$region] = ['score' => $score, 'quote' => $quote];
            }
        }

        $listings = array_values(array_map(
            static fn(array $entry): array => $entry['quote'],
            $verifiedByRegion
        ));
        if ($listings === []) {
            $listings = [$primaryQuote];
        }

        $relatedTickers = array_values(array_map(
            static fn(array $quote): string => (string) $quote['ticker'],
            $listings
        ));
        if (!in_array((string) $primaryQuote['ticker'], $relatedTickers, true)) {
            $relatedTickers[] = (string) $primaryQuote['ticker'];
        }

        $resolved = [
            'ticker' => (string) $primaryQuote['ticker'],
            'name' => $companyName,
            'relatedTickers' => $relatedTickers,
            'listings' => $listings,
        ];
        ResponseCache::set($cacheKey, $resolved, self::RESOLVE_TTL);

        return $resolved;
    }

    public static function fetchQuotes(array $tickers): array
    {
        if ($tickers === []) {
            return ['quotes' => [], 'failed' => []];
        }

        $quotes = [];
        $failed = [];
        $urls = [];

        foreach ($tickers as $ticker) {
            $cached = ResponseCache::get(self::cacheKey('quote', $ticker));
            if (is_array($cached)) {
                $quotes[$ticker] = $cached;
            } else {
                $urls[$ticker] = self::buildYahooChartUrl($ticker, self::QUOTE_CHART['interval'], self::QUOTE_CHART['range']);
            }
        }

        foreach (self::httpGetJsonMany($urls) as $ticker => $response) {
            $key = self::cacheKey('quote', (string) $ticker);
            try {
                if ($response instanceof Throwable) {
                    throw $response;
                }
                $quote = self::buildQuote(self::parseChartResult($response), (string) $ticker);
                ResponseCache::set($key, $quote, self::quoteTtl($quote));
                $quotes[$ticker] = $quote;
            } catch (Throwable $error) {
                $stale = ResponseCache::get($key, true);
                if (is_array($stale)) {
                    $quotes[$ticker] = $stale + ['stale' => true];
                } else {
                    $failed[] = [
                        'ticker' => (string) $ticker,
                        'error' => self::getErrorMessage($error),
                    ];
                }
            }
        }

        $ordered = [];
        foreach ($tickers as $ticker) {
            if (isset($quotes[$ticker])) {
                $ordered[] = $quotes[$ticker];
            }
        }

        return ['quotes' => $ordered, 'failed' => $failed];
    }

    public static function fetchTickerHistory(string $ticker, ?string $rangeKey): array
    {
        $normalizedTicker = self::normalizeTicker($ticker);
        if ($normalizedTicker === '') {
            throw new RuntimeException('Ticker is required');
        }

        $key = self::sanitizeHistoryRange($rangeKey);
        $config = self::HISTORY_RANGE_CONFIG[$key];
        $cacheKey = self::cacheKey('history', $normalizedTicker . ':' . $key);
        $cached = ResponseCache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $result = self::fetchChartResult($normalizedTicker, $config['interval'], $config['range']);
        } catch (Throwable $error) {
            $stale = ResponseCache::get($cacheKey, true);
            if (is_array($stale)) {
                return $stale + ['stale' => true];
            }
            throw $error;
        }

        $meta = isset($result['meta']) && is_array($result['meta']) ? $result['meta'] : [];
        $timestamps = isset($result['timestamp']) && is_array($result['timestamp']) ? $result['timestamp'] : [];
        $closes = self::indicatorSeries($result, 'close');

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

        $history = [
            'ticker' => isset($meta['symbol']) ? (string) $meta['symbol'] : $normalizedTicker,
            'name' => isset($meta['shortName']) ? (string) $meta['shortName'] : (isset($meta['longName']) ? (string) $meta['longName'] : null),
            'currency' => isset($meta['currency']) ? (string) $meta['currency'] : null,
            'exchangeTimezone' => isset($meta['exchangeTimezoneName']) ? (string) $meta['exchangeTimezoneName'] : null,
            'range' => $key,
            'interval' => $config['interval'],
            // Only a one-day chart's previous close is yesterday's close.
            'previousClose' => $key === '1d' ? self::metaPreviousClose($meta) : null,
            'points' => self::limitHistoryPoints($points),
        ];
        ResponseCache::set($cacheKey, $history, $config['ttl']);

        return $history;
    }

    public static function fetchFxRatesToEur(array $currencies): array
    {
        $normalized = self::sanitizeCurrencies($currencies);
        $rates = ['EUR' => 1.0];
        $failed = [];
        $urls = [];

        foreach ($normalized as $currency) {
            if ($currency === 'EUR') {
                continue;
            }
            $cached = ResponseCache::get(self::cacheKey('fx', $currency));
            if (is_numeric($cached) && (float) $cached > 0) {
                $rates[$currency] = (float) $cached;
            } else {
                $urls[$currency] = self::buildYahooChartUrl($currency . 'EUR=X', '1d', '5d');
            }
        }

        foreach (self::httpGetJsonMany($urls) as $currency => $response) {
            $key = self::cacheKey('fx', (string) $currency);
            try {
                if ($response instanceof Throwable) {
                    throw $response;
                }
                $meta = self::parseChartResult($response)['meta'];
                $rate = null;
                foreach (['regularMarketPrice', 'chartPreviousClose', 'previousClose'] as $field) {
                    if (isset($meta[$field]) && is_numeric($meta[$field])) {
                        $rate = (float) $meta[$field];
                        break;
                    }
                }
                if ($rate === null || !is_finite($rate) || $rate <= 0) {
                    throw new RuntimeException('No EUR rate for ' . $currency);
                }
                ResponseCache::set($key, $rate, self::FX_TTL);
                $rates[$currency] = $rate;
            } catch (Throwable $error) {
                $stale = ResponseCache::get($key, true);
                if (is_numeric($stale) && (float) $stale > 0) {
                    $rates[$currency] = (float) $stale;
                } else {
                    $failed[] = [
                        'currency' => (string) $currency,
                        'error' => self::getErrorMessage($error),
                    ];
                }
            }
        }

        return ['rates' => $rates, 'failed' => $failed];
    }

    private static function fetchChartQuote(string $ticker): array
    {
        $payload = self::fetchQuotes([$ticker]);
        if ($payload['quotes'] === []) {
            throw new RuntimeException($payload['failed'][0]['error'] ?? 'Symbol not found or unsupported');
        }
        return $payload['quotes'][0];
    }

    private static function buildQuote(array $result, string $requestedTicker): array
    {
        $meta = isset($result['meta']) && is_array($result['meta']) ? $result['meta'] : [];
        $number = static fn(string $field): ?float =>
            isset($meta[$field]) && is_numeric($meta[$field]) && is_finite((float) $meta[$field]) ? (float) $meta[$field] : null;

        $price = $number('regularMarketPrice');
        $prevClose = self::metaPreviousClose($meta);

        $change = null;
        $changePercent = null;
        if ($price !== null && $prevClose !== null && $prevClose != 0.0) {
            $change = $price - $prevClose;
            $changePercent = ($change / $prevClose) * 100;
        }

        $closes = array_values(array_filter(
            self::indicatorSeries($result, 'close'),
            static fn($value): bool => is_numeric($value) && is_finite((float) $value)
        ));
        $opens = array_values(array_filter(
            self::indicatorSeries($result, 'open'),
            static fn($value): bool => is_numeric($value) && is_finite((float) $value)
        ));
        $spark = array_map(
            static fn($value): float => round((float) $value, 6),
            array_column(self::limitHistoryPoints(array_map(static fn($value): array => ['v' => $value], $closes), self::SPARK_POINTS), 'v')
        );

        $regular = $meta['currentTradingPeriod']['regular'] ?? [];

        return [
            'ticker' => isset($meta['symbol']) ? (string) $meta['symbol'] : $requestedTicker,
            'name' => isset($meta['shortName']) ? (string) $meta['shortName'] : (isset($meta['longName']) ? (string) $meta['longName'] : null),
            'longName' => isset($meta['longName']) ? (string) $meta['longName'] : null,
            'currency' => isset($meta['currency']) ? (string) $meta['currency'] : null,
            'exchange' => isset($meta['fullExchangeName']) ? (string) $meta['fullExchangeName'] : (isset($meta['exchangeName']) ? (string) $meta['exchangeName'] : null),
            'exchangeTimezone' => isset($meta['exchangeTimezoneName']) ? (string) $meta['exchangeTimezoneName'] : null,
            'source' => 'Yahoo Finance chart API',
            'priceType' => 'regularMarketPrice',
            'price' => $price,
            'prevClose' => $prevClose,
            'change' => $change,
            'changePercent' => $changePercent,
            'marketTime' => self::toIsoFromEpoch($meta['regularMarketTime'] ?? null),
            'marketState' => self::resolveMarketState($meta),
            'sessionStart' => self::toIsoFromEpoch($regular['start'] ?? null),
            'sessionEnd' => self::toIsoFromEpoch($regular['end'] ?? null),
            'bid' => $number('bid'),
            'ask' => $number('ask'),
            'open' => $number('regularMarketOpen') ?? ($opens !== [] ? (float) $opens[0] : null),
            'dayHigh' => $number('regularMarketDayHigh'),
            'dayLow' => $number('regularMarketDayLow'),
            'volume' => $number('regularMarketVolume'),
            'averageVolume' => $number('averageDailyVolume3Month') ?? $number('averageDailyVolume10Day'),
            'marketCap' => $number('marketCap'),
            'fiftyTwoWeekHigh' => $number('fiftyTwoWeekHigh'),
            'fiftyTwoWeekLow' => $number('fiftyTwoWeekLow'),
            'spark' => $spark,
        ];
    }

    private static function metaPreviousClose(array $meta): ?float
    {
        foreach (['previousClose', 'regularMarketPreviousClose', 'chartPreviousClose'] as $field) {
            if (isset($meta[$field]) && is_numeric($meta[$field]) && (float) $meta[$field] > 0) {
                return (float) $meta[$field];
            }
        }
        return null;
    }

    private static function quoteTtl(array $quote): int
    {
        $state = (string) ($quote['marketState'] ?? '');
        if (in_array($state, ['REGULAR', 'PRE', 'PREPRE', 'POST', 'POSTPOST'], true)) {
            return self::QUOTE_TTL_OPEN;
        }

        // Closed: keep until the next regular session starts, at most QUOTE_TTL_CLOSED.
        $start = isset($quote['sessionStart']) ? strtotime((string) $quote['sessionStart']) : false;
        $now = time();
        if ($start !== false && $start > $now) {
            return max(self::QUOTE_TTL_OPEN, min(self::QUOTE_TTL_CLOSED, $start - $now));
        }
        return self::QUOTE_TTL_CLOSED;
    }

    private static function resolveMarketState(array $meta): ?string
    {
        if (isset($meta['marketState']) && is_string($meta['marketState']) && $meta['marketState'] !== '') {
            return strtoupper($meta['marketState']);
        }

        $periods = isset($meta['currentTradingPeriod']) && is_array($meta['currentTradingPeriod'])
            ? $meta['currentTradingPeriod']
            : [];
        $now = time();

        foreach (['regular' => 'REGULAR', 'pre' => 'PRE', 'post' => 'POST'] as $periodKey => $state) {
            $period = isset($periods[$periodKey]) && is_array($periods[$periodKey])
                ? $periods[$periodKey]
                : [];
            $start = isset($period['start']) && is_numeric($period['start']) ? (int) $period['start'] : null;
            $end = isset($period['end']) && is_numeric($period['end']) ? (int) $period['end'] : null;

            if ($start !== null && $end !== null && $now >= $start && $now < $end) {
                return $state;
            }
        }

        return $periods !== [] ? 'CLOSED' : null;
    }

    private static function indicatorSeries(array $result, string $field): array
    {
        $quote = $result['indicators']['quote'][0] ?? null;
        return is_array($quote) && isset($quote[$field]) && is_array($quote[$field]) ? $quote[$field] : [];
    }

    private static function cacheKey(string $kind, string $id): string
    {
        return self::CACHE_VERSION . ':' . $kind . ':' . $id;
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

    private static function searchYahooEquities(string $query): array
    {
        $url = sprintf(
            'https://query2.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=25&newsCount=0',
            rawurlencode($query)
        );
        $json = self::httpGetJson($url);
        $results = [];

        foreach (($json['quotes'] ?? []) as $quote) {
            if (!is_array($quote) || strtoupper((string) ($quote['quoteType'] ?? '')) !== 'EQUITY') {
                continue;
            }
            $results[] = [
                'symbol' => (string) ($quote['symbol'] ?? ''),
                'name' => (string) ($quote['longname'] ?? ($quote['shortname'] ?? '')),
            ];
        }

        return $results;
    }

    private static function companyNamesMatch(string $left, string $right): bool
    {
        $leftTokens = self::companyNameTokens($left);
        $rightTokens = self::companyNameTokens($right);
        if ($leftTokens === [] || $rightTokens === []) {
            return false;
        }

        $common = array_intersect($leftTokens, $rightTokens);
        $required = max(1, (int) ceil(max(count($leftTokens), count($rightTokens)) * 0.6));
        return count($common) >= $required;
    }

    private static function companyNameTokens(string $name): array
    {
        $normalized = preg_replace('/[^A-Z0-9]+/', ' ', strtoupper($name)) ?? '';
        $ignored = [
            'AG', 'ADR', 'CO', 'COMPANY', 'CORP', 'CORPORATION', 'GROUP', 'HOLDING',
            'HOLDINGS', 'INC', 'INCORPORATED', 'LIMITED', 'LTD', 'NV', 'ORD', 'PLC',
            'R', 'SA', 'SE', 'SHARE', 'SHARES', 'SHS',
        ];
        $tokens = array_filter(
            explode(' ', trim($normalized)),
            static fn(string $token): bool =>
                $token !== '' &&
                preg_match('/\d/', $token) !== 1 &&
                !in_array($token, $ignored, true)
        );
        return array_values(array_unique($tokens));
    }

    private static function classifyListingRegion(string $ticker, string $exchange): ?string
    {
        $symbol = strtoupper($ticker);
        $exchangeText = strtolower($exchange);
        if (
            preg_match('/\.(AX|HK|SS|SZ|KS|KQ|SI|TW|TWO|NS|BO|BK|KL|JK|NZ|T)$/', $symbol) === 1 ||
            preg_match('/asx|tokyo|hong kong|shanghai|shenzhen|singapore|korea|taiwan/', $exchangeText) === 1
        ) {
            return 'asia';
        }
        if (
            preg_match('/\.(F|DE|MU|DU|HA|L|PA|AS|BR|MC|MI|SW|ST|CO|OL|HE|LS|VI|WA)$/', $symbol) === 1 ||
            preg_match('/frankfurt|xetra|london|lse|euronext|milan|swiss/', $exchangeText) === 1
        ) {
            return 'europe';
        }
        if (
            strpos($symbol, '.') === false ||
            preg_match('/\.(TO|V|CN|MX|BA|SA)$/', $symbol) === 1 ||
            preg_match('/nasdaq|nyse|otc|toronto|mexico|sao paulo/', $exchangeText) === 1
        ) {
            return 'americas';
        }
        return null;
    }

    private static function listingPreferenceScore(string $ticker, string $region): int
    {
        $symbol = strtoupper($ticker);
        if ($region === 'europe') {
            if (str_ends_with($symbol, '.F')) return 0;
            if (str_ends_with($symbol, '.DE')) return 1;
            if (preg_match('/\.(MU|DU|HA)$/', $symbol) === 1) return 2;
            if (str_ends_with($symbol, '.L')) return 2;
        }
        return strpos($symbol, '.') === false ? 0 : 5;
    }

    private static function fetchChartResult(string $ticker, string $interval, string $range): array
    {
        return self::parseChartResult(self::httpGetJson(self::buildYahooChartUrl($ticker, $interval, $range)));
    }

    private static function parseChartResult(array $json): array
    {
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

    private static function curlOptions(): array
    {
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['User-Agent: stock-monitor-php/1.0'],
        ];
        if (defined('CURLOPT_SSL_OPTIONS') && defined('CURLSSLOPT_NATIVE_CA')) {
            $options[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
        }
        return $options;
    }

    /**
     * Fetches several JSON URLs in parallel batches. Returns key => decoded array or Throwable.
     */
    private static function httpGetJsonMany(array $urls): array
    {
        if ($urls === []) {
            return [];
        }

        $results = [];
        if (!function_exists('curl_multi_init')) {
            foreach ($urls as $key => $url) {
                try {
                    $results[$key] = self::httpGetJson($url);
                } catch (Throwable $error) {
                    $results[$key] = $error;
                }
            }
            return $results;
        }

        foreach (array_chunk($urls, self::PARALLEL_REQUESTS, true) as $batch) {
            $multi = curl_multi_init();
            $handles = [];
            foreach ($batch as $key => $url) {
                $handle = curl_init($url);
                if ($handle === false) {
                    $results[$key] = new RuntimeException('Failed to initialize cURL');
                    continue;
                }
                curl_setopt_array($handle, self::curlOptions());
                curl_multi_add_handle($multi, $handle);
                $handles[$key] = $handle;
            }

            do {
                $status = curl_multi_exec($multi, $running);
                if ($running > 0 && curl_multi_select($multi, 1.0) === -1) {
                    usleep(1000);
                }
            } while ($running > 0 && $status === CURLM_OK);

            foreach ($handles as $key => $handle) {
                $body = curl_multi_getcontent($handle);
                $code = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
                $error = curl_error($handle);
                curl_multi_remove_handle($multi, $handle);

                if (!is_string($body) || $body === '') {
                    $results[$key] = new RuntimeException('HTTP request failed: ' . ($error !== '' ? $error : 'Empty response'));
                    continue;
                }
                if ($code < 200 || $code >= 300) {
                    $results[$key] = new RuntimeException('Yahoo chart request failed (' . $code . ')');
                    continue;
                }
                $decoded = json_decode($body, true);
                $results[$key] = is_array($decoded) ? $decoded : new RuntimeException('Invalid response from Yahoo Finance');
            }
            curl_multi_close($multi);
        }

        return $results;
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

            curl_setopt_array($ch, self::curlOptions());

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
                : ($http_response_header ?? []);
            foreach (($responseHeaders ?? []) as $responseHeader) {
                // Redirects include multiple status lines; use the final response.
                if (preg_match('/^HTTP\/\S+\s+(\d{3})(?:\s|$)/i', (string) $responseHeader, $matches) === 1) {
                    $status = (int) $matches[1];
                }
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
