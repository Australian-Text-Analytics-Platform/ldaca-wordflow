import { resolve } from 'node:path';
import { browser } from '@wdio/globals';
import '@wdio/types';
import type { TauriServiceOptions } from '@wdio/tauri-service';
import { connectErrorCapture } from './e2e-browser/diagnostics';

const outputDir = process.env.WORDFLOW_E2E_OUTPUT_DIR ?? resolve(import.meta.dirname, '.tmp/wdio/native-debug');
const appBinaryPath = process.env.WORDFLOW_E2E_BINARY ?? resolve(import.meta.dirname, '../target/debug',
  process.platform === 'win32' ? 'ldaca-wordflow.exe' : 'ldaca-wordflow');
const service: TauriServiceOptions = {
  appBinaryPath,
  driverProvider: 'embedded',
  windowLabel: 'project-0',
  captureBackendLogs: true,
  captureFrontendLogs: true,
  logDir: outputDir,
};

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./e2e-native/**/*.spec.ts'],
  maxInstances: 1, // One production-identity process owns all its project windows.
  services: [['tauri', service]],
  capabilities: [{ browserName: 'tauri' }],
  framework: 'mocha',
  reporters: ['spec'],
  logLevel: 'warn',
  outputDir,
  waitforTimeout: 15_000,
  connectionRetryCount: 0,
  mochaOpts: { timeout: 60_000, require: ['./e2e-native/hooks.ts'] },
  async afterCommand(name) {
    if (name === 'switchToWindow') await connectErrorCapture();
  },
  async before() {
    // Shared scenarios also run in Chrome. Route all native screenshots into
    // this build's evidence folder, including older relative screenshot paths.
    browser.overwriteCommand('saveScreenshot', (save: typeof browser.saveScreenshot, file: string, options?: Parameters<typeof browser.saveScreenshot>[1]) =>
      save.call(browser, resolve(outputDir, file.split(/[\\/]/).at(-1) ?? file), options));
    // The embedded driver returns from reload before navigation. Wait through
    // getPageSource (a direct native read), not execute's document-local result
    // polling, which can lose its result when the old document is discarded.
    // WDIO supports protocol overrides at runtime but omits them from this type.
    // @ts-expect-error -- refresh is a WebDriver protocol command.
    browser.overwriteCommand('refresh', async (refresh: () => Promise<void>) => {
      const marker = `wdio-document-${String(Date.now())}`;
      await browser.execute((value) => {
        window.__wordflowDiagnostics?.prepareForNavigation();
        document.documentElement.setAttribute('data-wdio-document', value);
      }, marker);
      await refresh();
      await browser.waitUntil(async () => !(await browser.getPageSource()).includes(marker), {
        timeoutMsg: 'The reloaded WebView has not replaced its previous document',
      });
      await connectErrorCapture();
    });
    // Explicit selection bypasses the service's title-based focus polling, which
    // can race reload and wait 30 seconds for an IPC response from the old page.
    await browser.switchToWindow('project-0');
    // Spec workers share the app. Reset the screen and drafts, keeping the runtime.
    await browser.refresh();
    await browser.$('h1=Data Loader').waitForDisplayed();
  },
  async afterTest(test, _context, { passed }) {
    if (!passed) {
      await browser.saveScreenshot(resolve(outputDir, `${test.title.replace(/[^a-z0-9]+/gi, '-')}.png`));
    }
  },
};
