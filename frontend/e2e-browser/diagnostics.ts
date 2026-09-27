import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browser } from '@wdio/globals';
import { ErrorCollector } from './errorCollector';
import type {} from './errorBridge';

let collector: ErrorCollector;
let endpoint = '';
let captureFailure: Error | undefined;
export async function startErrorCapture(native = false) {
  collector = new ErrorCollector(native);
  endpoint = await collector.start();
}
export function resetErrorCapture() { collector.reset(); captureFailure = undefined; }
export function expectAppError(pattern: RegExp, count = 1) { collector.expect(pattern, count); }

export async function connectErrorCapture() {
  if (!endpoint) return;
  if (/^(about:|data:)/.test(await browser.getUrl())) return;
  try {
    await browser.waitUntil(() => browser.execute(() => Boolean(window.__wordflowDiagnostics)), {
      timeoutMsg: 'E2E error capture bridge did not load',
    });
    await browser.execute((url) => {
      if (!window.__wordflowDiagnostics) throw new Error('Missing E2E error bridge');
      return window.__wordflowDiagnostics.connect(url);
    }, endpoint);
  } catch (error) {
    // WDIO command-hook errors are only logged; the Mocha teardown must fail too.
    captureFailure = error instanceof Error ? error : new Error(String(error));
    throw error;
  }
}

export async function checkAppErrors(title: string, outputDir: string) {
  let failure: Error | undefined;
  try {
    await browser.execute(() => window.__wordflowDiagnostics?.flush());
    if (captureFailure) throw captureFailure;
    collector.assertExpected();
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    console.error(`Session error check failed: ${title}\n${String(error)}`);
  } finally {
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, `${title.replace(/[^a-z0-9]+/gi, '-')}.errors.json`),
      JSON.stringify({ errors: [...collector.records.values()], failure: failure ? String(failure) : undefined }, null, 2));
  }
  if (failure) throw failure;
}

export async function stopErrorCapture() {
  try { await browser.execute(() => window.__wordflowDiagnostics?.disconnect()); }
  finally { await collector.close(); endpoint = ''; }
}
