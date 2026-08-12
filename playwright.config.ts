import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: `next dev -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Force DB-backed reads — E2E needs the real DB, not mock fixtures.
        //
        // IMPORTANT: `e2e/helpers/fixtures.ts` seeds the LOCAL Supabase
        // (127.0.0.1:54322), but the dev server inherits `.env.local`, which
        // may point at a hosted project. When they disagree the specs fail
        // confusingly — seeded venues simply never appear. Export the E2E_*
        // vars below (values from `npx supabase status`) to pin the dev
        // server at the same database the fixtures write to.
        env: {
          NEXT_PUBLIC_USE_DB: "true",
          ...(process.env.E2E_SUPABASE_URL
            ? { NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL }
            : {}),
          ...(process.env.E2E_SUPABASE_ANON_KEY
            ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY }
            : {}),
          ...(process.env.E2E_SERVICE_ROLE_KEY
            ? { SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SERVICE_ROLE_KEY }
            : {}),
          ...(process.env.E2E_DATABASE_URL
            ? { DATABASE_URL: process.env.E2E_DATABASE_URL }
            : {}),
        },
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
