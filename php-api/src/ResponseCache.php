<?php

declare(strict_types=1);

/**
 * Small JSON file cache in private temporary storage outside the document root.
 * It fails open: when no private storage is available, nothing is cached.
 */
final class ResponseCache
{
    private const STALE_LIMIT_SECONDS = 172800;

    private static ?string $directory = null;
    private static bool $resolved = false;

    public static function directory(): ?string
    {
        if (self::$resolved) {
            return self::$directory;
        }
        self::$resolved = true;

        $base = realpath(sys_get_temp_dir());
        $documentRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
        if ($base === false || ($documentRoot !== false && $documentRoot !== '/' && str_starts_with($base . '/', $documentRoot . '/'))) {
            return null;
        }

        $directory = $base . '/jm-share-monitor-' . substr(hash('sha256', __DIR__), 0, 24);
        if (is_link($directory)) {
            return null;
        }
        if (!is_dir($directory) && !@mkdir($directory, 0700) && !is_dir($directory)) {
            return null;
        }
        if (!is_writable($directory)) {
            return null;
        }

        self::$directory = $directory;
        if (random_int(1, 500) === 1) {
            self::prune($directory);
        }

        return $directory;
    }

    /** Returns the cached value, or null when missing or expired (stale entries only when allowed). */
    public static function get(string $key, bool $allowStale = false): mixed
    {
        $path = self::pathFor($key);
        if ($path === null || !is_file($path) || is_link($path)) {
            return null;
        }

        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }

        $entry = json_decode($raw, true);
        if (!is_array($entry) || !isset($entry['expires']) || !array_key_exists('value', $entry)) {
            return null;
        }

        $now = time();
        $expires = (int) $entry['expires'];
        if ($expires >= $now) {
            return $entry['value'];
        }
        if ($allowStale && $expires + self::STALE_LIMIT_SECONDS >= $now) {
            return $entry['value'];
        }

        return null;
    }

    public static function set(string $key, mixed $value, int $ttlSeconds): void
    {
        $path = self::pathFor($key);
        if ($path === null || $ttlSeconds <= 0 || is_link($path)) {
            return;
        }

        $encoded = json_encode(['expires' => time() + $ttlSeconds, 'value' => $value], JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            return;
        }

        $temporary = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (@file_put_contents($temporary, $encoded, LOCK_EX) === strlen($encoded)) {
            @chmod($temporary, 0600);
            if (!@rename($temporary, $path)) {
                @unlink($temporary);
            }
        } else {
            @unlink($temporary);
        }
    }

    private static function pathFor(string $key): ?string
    {
        $directory = self::directory();
        return $directory === null ? null : $directory . '/c-' . sha1($key) . '.json';
    }

    private static function prune(string $directory): void
    {
        $cutoff = time() - self::STALE_LIMIT_SECONDS;
        foreach (glob($directory . '/c-*') ?: [] as $file) {
            if (is_file($file) && !is_link($file) && (int) @filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }
    }
}
