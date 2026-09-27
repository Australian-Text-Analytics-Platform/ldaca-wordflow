import { browser } from '@wdio/globals';
import { resolve } from 'node:path';
import '@wdio/types';
import ServerHost from './scripts/e2e-server.mjs';
export const config: WebdriverIO.Config = {
  runner: 'local', specs: ['./e2e-server/**/*.spec.ts'], maxInstances: 1,
  services: [[ServerHost, {}]],
  capabilities: [{ browserName: 'chrome', 'goog:chromeOptions': { args: ['--headless=new','--window-size=1280,900', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], prefs: { 'download.default_directory': resolve('.tmp/wdio/server/downloads') } } }],
  baseUrl: 'http://127.0.0.1:3237/', framework: 'mocha', reporters: ['spec'], logLevel: 'warn', outputDir: '.tmp/wdio/server', waitforTimeout: 15000, connectionRetryCount: 0, mochaOpts: { timeout: 120000 },
  async afterTest(test, _context, { passed }) { if (!passed) await browser.saveScreenshot(resolve('.tmp/wdio/server',test.title.replace(/[^a-z0-9]/gi,'-')+'.png')); },
};
