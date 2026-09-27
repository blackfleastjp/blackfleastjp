import { defineConfig } from "@playwright/test";

const baseURL = process.env["PLAYWRIGHT_BASE_URL"];
if (!baseURL)
  throw new Error("Set PLAYWRIGHT_BASE_URL to the running web app before running browser tests");

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL, headless: true },
  reporter: "list",
});
