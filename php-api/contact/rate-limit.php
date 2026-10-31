<?php

declare(strict_types=1);

/** Reserve an attempt. Store only short-lived timestamps and keyed IP hashes. */
function contactRateLimit(string $remoteAddress): int
{
    $base = realpath(sys_get_temp_dir());
    $documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($base === false || ($documentRoot !== false && str_starts_with($base . '/', $documentRoot . '/'))) {
        throw new RuntimeException('Private temporary storage is unavailable.');
    }
    $directory = $base . '/jm-contact-' . substr(hash('sha256', __DIR__), 0, 24);
    if (is_link($directory) || (!is_dir($directory) && !@mkdir($directory, 0700) && !is_dir($directory))) {
        throw new RuntimeException('Rate limiter is unavailable.');
    }
    $path = $directory . '/attempts.json';
    if (is_link($path)) throw new RuntimeException('Invalid rate-limit storage.');
    $file = @fopen($path, 'c+b');
    if ($file === false) throw new RuntimeException('Rate limiter is unavailable.');
    try {
        if (!@chmod($path, 0600) || !flock($file, LOCK_EX)) throw new RuntimeException('Cannot lock rate limiter.');
        $raw = stream_get_contents($file, 1048577);
        if ($raw === false || strlen($raw) > 1048576) throw new RuntimeException('Invalid rate-limit state.');
        $state = $raw === '' ? ['key' => bin2hex(random_bytes(32)), 'global' => [], 'clients' => []]
            : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($state) || !is_string($state['key'] ?? null) || !is_array($state['global'] ?? null) || !is_array($state['clients'] ?? null)) {
            throw new RuntimeException('Invalid rate-limit state.');
        }
        $now = time();
        $cutoff = $now - 900;
        $recent = static fn(array $times): array => array_values(array_filter($times, static fn($time): bool => is_int($time) && $time > $cutoff));
        $state['global'] = $recent($state['global']);
        foreach ($state['clients'] as $client => $times) {
            $state['clients'][$client] = $recent($times);
            if ($state['clients'][$client] === []) unset($state['clients'][$client]);
        }
        // Do not trust client-supplied X-Forwarded-For headers.
        $client = hash_hmac('sha256', $remoteAddress, $state['key']);
        $attempts = $state['clients'][$client] ?? [];
        if (count($attempts) >= 5) return max(1, min($attempts) + 900 - $now);
        if (count($state['global']) >= 30) return max(1, min($state['global']) + 900 - $now);
        $state['global'][] = $now;
        $attempts[] = $now;
        $state['clients'][$client] = $attempts;
        $encoded = json_encode($state, JSON_THROW_ON_ERROR);
        if (!rewind($file) || !ftruncate($file, 0) || fwrite($file, $encoded) !== strlen($encoded) || !fflush($file)) {
            throw new RuntimeException('Cannot persist rate limit.');
        }
        return 0;
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
}
