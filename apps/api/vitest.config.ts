import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files share a real PostgreSQL database, so they must run sequentially
    // to avoid FK constraint violations from concurrent table truncation.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
