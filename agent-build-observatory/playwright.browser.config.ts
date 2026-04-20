import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
