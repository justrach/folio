import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.GUI_BASE_URL || "http://localhost:3001";
const serverPort = new URL(baseURL).port || (new URL(baseURL).protocol === "https:" ? "443" : "80");

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    ...(process.env.CI ? {storageState:{cookies:[],origins:[{origin:new URL(baseURL).origin,localStorage:[{name:"folio-product-analytics-opt-out",value:"1"}]}]}} : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${serverPort}`,
    // Public readiness must not require credentials or a prepared local auth database.
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    timeout: 120_000,
  },
});
