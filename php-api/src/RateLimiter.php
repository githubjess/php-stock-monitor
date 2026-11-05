<?php

declare(strict_types=1);

require_once __DIR__ . '/ResponseCache.php';

/**
 * Sliding-window request limiter per client and bucket. Stores only keyed hashes of
 * client addresses and recent timestamps. It fails open so a storage problem never
 * takes the Share Monitor offline.
 */
final class RateLimiter
{
    /** Returns 0 when the request may proceed, otherwise the seconds to wait. */
    public static function hit(string $clientAddress, string $bucket, int $limit, int $windowSeconds): int
    {
        try {
            $directory = ResponseCache::directory();
            if ($directory === null || $clientAddress === '') {
                return 0;
            }

            $secret = self::secret($directory);
            $client = hash_hmac('sha256', $bucket . '|' . $clientAddress, $secret);
            $path = $directory . '/rl-' . substr($client, 0, 40) . '.json';
            if (is_link($path)) {
                return 0;
            }

            $file = @fopen($path, 'c+b');
            if ($file === false) {
                return 0;
            }

            try {
                if (!flock($file, LOCK_EX)) {
                    return 0;
                }
                @chmod($path, 0600);
                $raw = stream_get_contents($file, 65536);
                $times = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
                if (!is_array($times)) {
                    $times = [];
                }

                $now = time();
                $cutoff = $now - $windowSeconds;
                $times = array_values(array_filter($times, static fn($time): bool => is_int($time) && $time > $cutoff));
                if (count($times) >= $limit) {
                    return max(1, min($times) + $windowSeconds - $now);
                }

                $times[] = $now;
                $encoded = json_encode($times);
                if ($encoded !== false && rewind($file) && ftruncate($file, 0)) {
                    fwrite($file, $encoded);
                    fflush($file);
                }
                return 0;
            } finally {
                flock($file, LOCK_UN);
                fclose($file);
            }
        } catch (Throwable $error) {
            return 0;
        }
    }

    private static function secret(string $directory): string
    {
        $path = $directory . '/rl-secret';
        if (!is_link($path)) {
            $existing = @file_get_contents($path);
            if (is_string($existing) && strlen($existing) === 64) {
                return $existing;
            }
        }

        $secret = bin2hex(random_bytes(32));
        if (!is_link($path) && @file_put_contents($path, $secret, LOCK_EX) === 64) {
            @chmod($path, 0600);
        }
        return $secret;
    }
}
