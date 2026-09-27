import { browser, $, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { expectAppError } from './diagnostics';

export async function sessionErrorsScenario(host: 'browser' | 'native') {
  expectAppError(/diagnostics sentinel/);
  await browser.execute(() => {
    if (!window.__wordflowDiagnostics) throw new Error('Missing E2E error bridge');
    window.__wordflowDiagnostics.report('diagnostics sentinel');
  });
  await $('[data-sonner-toast] [data-close-button]').click();
  await expect($('[data-sonner-toast]')).not.toExist();
  await $('button[aria-label="Open settings"]').click();
  await $('summary*=Session errors').click();
  await expect($('summary*=Session errors')).toHaveText('Session errors (1)');
  await $('summary*=Diagnostics test').click();
  await expect($('button=Copy all')).toBeEnabled();
  for (const dark of [false, true]) {
    const toggle = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    if (((await toggle.getAttribute('aria-checked')) === 'true') !== dark) await toggle.click();
    const dialog = $('[role="dialog"]');
    await browser.waitUntil(() => dialog.execute((element) => getComputedStyle(element).opacity === '1'));
    await expect($('html')).toHaveAttribute('data-theme', dark ? 'dark-2026' : 'light-2026');
    await dialog.execute(async (element) => {
      await Promise.allSettled(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); });
      });
    });
    await browser.saveScreenshot(resolve(import.meta.dirname, `../.tmp/wdio/${host}-diagnostics-${dark ? 'dark' : 'light'}.png`));
    expect(await dialog.execute((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await $('button=Clear').click();
  await expect($('summary*=Session errors')).toHaveText('Session errors (0)');
  await browser.refresh();
  await $('h1=Data Loader').waitForDisplayed();
  await $('button[aria-label="Open settings"]').click();
  await $('summary*=Session errors').click();
  await expect($('summary*=Session errors')).toHaveText('Session errors (0)');
  // The runner still requires the original event after Clear and reload.
}
