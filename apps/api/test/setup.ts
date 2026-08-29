/**
 * Global test setup — runs before any test file.
 *
 * PRIMARY SAFETY GUARD: Refuse to run if DATABASE_URL points to
 * intentflow_dev. This prevents destructive test cleanup (deleteMany,
 * etc.) from destroying the development catalog.
 */

const dbUrl = process.env["DATABASE_URL"] ?? "";

if (!dbUrl) {
  throw new Error(
    "[TEST SAFETY] DATABASE_URL is not set. " +
      "Run tests via: npm test --workspace=@intentflow/api\n" +
      "This command loads .env.test via node --env-file=../../.env.test"
  );
}

if (dbUrl.includes("intentflow_dev")) {
  throw new Error(
    "[TEST SAFETY] DATABASE_URL points to intentflow_dev.\n" +
      "Tests MUST run against intentflow_test only.\n" +
      "Refusing to start — tests would destroy development catalog data.\n\n" +
      "Fix: ensure .env.test is correct and use:\n" +
      "  npm test --workspace=@intentflow/api"
  );
}

if (!dbUrl.includes("intentflow_test")) {
  // Warn but don't block — could be a CI/CD database with a different name.
  console.warn(
    "[TEST SAFETY] WARNING: DATABASE_URL does not contain 'intentflow_test'.\n" +
      `  Current URL: ${dbUrl.replace(/:[^:@]+@/, ":***@")}\n` +
      "  Proceeding, but verify this is intentional."
  );
}

// Confirm to console which DB is being used (masked credentials).
const maskedUrl = dbUrl.replace(/:[^:@]+@/, ":***@");
console.info(`[TEST SETUP] Connected to: ${maskedUrl}`);
