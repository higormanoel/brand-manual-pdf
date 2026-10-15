import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(chrome) ? chrome : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    viewport: { width: 1920, height: 1080 },
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 4178",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
  },
});
