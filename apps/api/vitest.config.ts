import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @intentflow/api.
 *
 * Environment loading order:
 * 1. `node --env-file=../../.env.test` in package.json sets NODE_ENV=test
 *    and DATABASE_URL=intentflow_test before Node starts.
 * 2. Vite's own dotenv loader can re-read the root .env and overwrite
 *    DATABASE_URL back to intentflow_dev.
 * 3. We therefore hard-code the test DATABASE_URL here so it always wins,
 *    regardless of which .env files Vite picks up during startup.
 *
 * The test DB URL is intentionally not a secret — it is a local development
 * database accessible only on localhost.
 */
const TEST_DATABASE_URL = "postgresql://intentflow:intentflow@localhost:5432/intentflow_test";

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30_000,
    // Hard-set the test DATABASE_URL so Vite's dotenv loader cannot
    // accidentally revert it to intentflow_dev.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: "test",
    },
    // Runs before every test file — enforces the intentflow_test safety guard.
    setupFiles: ["./test/setup.ts"],
  },
});
