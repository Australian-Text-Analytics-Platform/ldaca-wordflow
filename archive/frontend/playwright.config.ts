import { defineConfig, devices } from '@playwright/test';
import { isAbsolute } from 'node:path';

const dataRoot = process.env.WORDFLOW_E2E_DATA_ROOT;
if (!dataRoot || !isAbsolute(dataRoot)) {
  throw new Error('Run Playwright through pnpm test:e2e so it receives an isolated Data Root.');
}

const frontendUrl = 'http://127.0.0.1:3210';
const backendUrl = 'http://127.0.0.1:8211';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: '.tmp/playwright-report', open: 'never' }]]
    : 'list',
  outputDir: '.tmp/playwright-results',
  use: {
    baseURL: frontendUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'uv run --project ../backend --no-sync uvicorn ldaca_wordflow.asgi:app --host 127.0.0.1 --port 8211 --log-level warning',
      name: 'FastAPI',
      url: `${backendUrl}/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      env: {
        DATA_ROOT: dataRoot,
        CORS_ALLOWED_ORIGINS: JSON.stringify([frontendUrl]),
      },
    },
    {
      command: 'pnpm dev',
      name: 'Vite',
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      env: {
        FRONTEND_PORT: '3210',
        VITE_BACKEND_API_BASE: `${backendUrl}/api`,
        VITE_BACKEND_PORT: '8211',
        VITE_DOCS_ORIGIN: '',
      },
    },
  ],
});
