import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "qa/chat",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "off",
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3210",
    url: "http://127.0.0.1:3210",
    timeout: 180000,
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
