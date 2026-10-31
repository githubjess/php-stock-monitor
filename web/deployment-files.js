// Explicit release allowlist. Existing server components are not copied wholesale.
// Add every PHP endpoint/helper required by a future release here.
export const deploymentFiles = [
  { source: "../php-api/contact/send.php", destination: "contact/send.php" },
  { source: "../php-api/contact/rate-limit.php", destination: "contact/rate-limit.php" },
];
