import { browser } from '@wdio/globals';
import { resolve } from 'node:path';
import { finishTestTasks, resetProject } from '../e2e-browser/fixtures';

async function backendUrl() {
  return (
    await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    )
  ).url;
}
import {
  startErrorCapture,
  resetErrorCapture,
  connectErrorCapture,
  checkAppErrors,
  stopErrorCapture,
} from '../e2e-browser/diagnostics';

export const mochaHooks = {
  beforeAll: () => startErrorCapture(true),
  async beforeEach() {
    // This run shares isolated WebView storage across reloads and windows. Each scenario
    // starts with product defaults; responsive tests opt into other sizes.
    await browser.execute(async () => {
      // Finish delivery from the old document before resetting the collector.
      window.__wordflowDiagnostics?.prepareForNavigation();
      await window.__wordflowDiagnostics?.flush();
      window.__wordflowDiagnostics?.disconnect();
      localStorage.removeItem('ldaca.layout.asidePanelRatio');
      localStorage.removeItem('ldaca.layout.sidebarWidth');
    });
    resetErrorCapture();
    // pagehide releases any editor left by a failed predecessor before database cleanup.
    await browser.refresh();
    await resetProject(await backendUrl());
    await browser.refresh();
    await browser.$('h1=Data Loader').waitForDisplayed();
    await connectErrorCapture();
  },
  async afterEach(this: Mocha.Context) {
    // Reload releases abandoned editor sessions; accepted tasks need explicit cancellation.
    await finishTestTasks(await backendUrl());
    await checkAppErrors(
      this.currentTest?.fullTitle() ?? 'unknown-test',
      process.env.WORDFLOW_E2E_OUTPUT_DIR ??
        resolve(import.meta.dirname, '../.tmp/wdio/native-debug'),
    );
  },
  afterAll: stopErrorCapture,
};
