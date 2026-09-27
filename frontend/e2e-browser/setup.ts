import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { browser } from '@wdio/globals';
import {
  role,
  registerQueries,
  resetProject,
  baseUrl,
  clearResponseStubs,
  finishTestTasks,
} from './fixtures';
import {
  startErrorCapture,
  resetErrorCapture,
  checkAppErrors,
  stopErrorCapture,
} from './diagnostics';
import { outputDir } from './fixtures';
const require = createRequire(import.meta.url);
const testingLibrary = await readFile(
  resolve(dirname(require.resolve('@testing-library/dom')), '@testing-library/dom.umd.js'),
  'utf8',
);
const networkEvents = [
  'network.beforeRequestSent',
  'network.responseStarted',
  'network.responseCompleted',
] as const;
// Mocha setup failures stop the scenario rather than merely logging a runner-hook error.
export const mochaHooks = {
  async beforeAll() {
    registerQueries();
    await startErrorCapture();
  },
  afterAll: stopErrorCapture,
  async beforeEach() {
    // A previous test's document must stop reporting before the runner clears its records.
    await browser.execute(() => window.__wordflowDiagnostics?.disconnect());
    await browser.reloadSession();
    resetErrorCapture();
    await browser.setViewport({ width: 1280, height: 900 });
    await browser.scriptAddPreloadScript({
      functionDeclaration: `() => { ${testingLibrary} }`,
      contexts: [await browser.getWindowHandle()],
    });
    await browser.sessionSubscribe({ events: [...networkEvents] });
    await browser.networkAddDataCollector({
      dataTypes: ['request', 'response'],
      maxEncodedDataSize: 10 * 1024 * 1024,
    });
    await resetProject();
  },
  async afterEach(this: Mocha.Context) {
    await clearResponseStubs();
    // A failed scenario must release its editor and accepted tasks before the next reset.
    const editor = role('dialog', { name: 'Edit Table' });
    if ((await browser.getUrl()).startsWith(baseUrl) && (await editor.isExisting())) {
      await role('button', { name: 'Cancel', exact: true }, editor).click();
      const discard = role('button', { name: 'Discard changes', exact: true });
      if (await discard.isExisting()) await discard.click();
    }
    await finishTestTasks();
    await checkAppErrors(this.currentTest?.fullTitle() ?? 'unknown-test', outputDir);
  },
};
