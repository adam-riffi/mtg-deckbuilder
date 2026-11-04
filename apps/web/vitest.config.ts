import { defineConfig } from "vitest/config";

// Playwright specs in e2e/ are run by `pnpm test:e2e`, not Vitest.
export default defineConfig({
  test: { exclude: ["e2e/**", "node_modules/**", ".next/**"], passWithNoTests: true },
});
