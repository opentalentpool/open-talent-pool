import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:8180",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "NODE_ENV=test OTP_IN_MEMORY_DB=true ENABLE_TEST_ROUTES=true PORT=4100 APP_BASE_URL=http://127.0.0.1:8180 TRUSTED_ORIGINS=http://127.0.0.1:8180 TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA node server/index.js",
      url: "http://127.0.0.1:4100/api/test/emails",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_API_URL=http://127.0.0.1:4100 VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm exec vite --host 127.0.0.1 --port 8180 --strictPort",
      url: "http://127.0.0.1:8180",
      reuseExistingServer: false,
    },
  ],
});
