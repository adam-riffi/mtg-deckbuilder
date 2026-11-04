import { defineConfig } from "@playwright/test";

/** E2E tests run against a running app (`pnpm dev`) with card data ingested (fixtures or Scryfall). */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    // Optional: point at a pre-installed Chromium (e.g. in sandboxes) instead of Playwright's download.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  reporter: [["list"]],
});
