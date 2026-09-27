import { mkdir } from 'node:fs/promises';
import { browser } from '@wdio/globals';
import { resolve } from 'node:path';
import '@wdio/types';
import PreviewHost from './scripts/e2e-preview.mjs';
import { baseUrl, outputDir, screenshot } from './e2e-browser/fixtures';
import { connectErrorCapture } from './e2e-browser/diagnostics';
export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./e2e-browser/**/*.spec.ts'],
  maxInstances: 1,
  services: [[PreviewHost, {}]],
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          '--headless=new',
          '--window-size=1280,900',
          '--disable-dev-shm-usage',
          // Retain the existing Linux CI launch policy; macOS uses Chrome's sandbox.
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
        prefs: { 'download.default_directory': resolve(outputDir, 'downloads') },
      },
    },
  ],
  baseUrl,
  framework: 'mocha',
  reporters: ['spec'],
  logLevel: 'warn',
  outputDir,
  waitforTimeout: 15_000,
  connectionRetryCount: 0,
  mochaOpts: { timeout: 90_000, require: ['./e2e-browser/setup.ts'] },
  async onPrepare() {
    await mkdir(resolve(outputDir, 'downloads'), { recursive: true });
  },
  async afterCommand(name) {
    if (['url', 'refresh', 'switchToWindow'].includes(name)) await connectErrorCapture();
  },
  async beforeCommand(name) {
    if (['url', 'refresh', 'reloadSession'].includes(name)) {
      await browser.execute(() => window.__wordflowDiagnostics?.prepareForNavigation());
    }
  },
  async afterTest(test, _context, { passed }) {
    if (!passed) await screenshot(test.title.replace(/[^a-z0-9]+/gi, '-') + '.png');
  },
};
