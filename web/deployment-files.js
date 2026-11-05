// Explicit release allowlist. Existing server components are not copied wholesale.
// Add every PHP endpoint/helper required by a future release here.
export const deploymentFiles = [
  { source: "../php-api/contact/send.php", destination: "contact/send.php" },
  { source: "../php-api/contact/rate-limit.php", destination: "contact/rate-limit.php" },
  // Share Monitor API (served at /api/... through the site's .htaccess rewrite).
  { source: "../php-api/public/index.php", destination: "php-api/public/index.php" },
  { source: "../php-api/src/MarketData.php", destination: "php-api/src/MarketData.php" },
  { source: "../php-api/src/ResponseCache.php", destination: "php-api/src/ResponseCache.php" },
  { source: "../php-api/src/RateLimiter.php", destination: "php-api/src/RateLimiter.php" },
];
