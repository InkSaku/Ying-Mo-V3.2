import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8776",
    screenshot: "only-on-failure",
    trace: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "../backend/.venv/bin/python scripts/run_e2e_server.py",
      cwd: "../backend",
      url: "http://127.0.0.1:8775/api/v1/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --port 8776 --strictPort",
      cwd: ".",
      env: { VITE_DEV_API_PROXY: "http://127.0.0.1:8775" },
      url: "http://127.0.0.1:8776/login",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
