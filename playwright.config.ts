import { defineConfig } from '@playwright/test';

/**
 * Browser verification owns a packaged local application. CI/hosts can point
 * it at an already-running origin with EDATIME_E2E_BASE_URL instead.
 */
const baseURL = process.env.EDATIME_E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
    testDir: './tests',
    testMatch: '**/e2e_audit_tests.ts',
    timeout: 30_000,
    fullyParallel: false,
    use: {
        baseURL,
        trace: 'retain-on-failure',
    },
    webServer: process.env.EDATIME_E2E_BASE_URL
        ? undefined
        : {
            command: 'cargo run -p edatime-bin',
            url: baseURL,
            reuseExistingServer: true,
            timeout: 120_000,
        },
});
