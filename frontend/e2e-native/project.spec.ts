/// <reference lib="dom" />
import { browser, $, expect } from '@wdio/globals';
import { describe, it } from 'mocha';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Real IPC through the test-only bridge, without command mocks.
function backendStatus() {
  return browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ status: string; url?: string }>,
  );
}

describe('Tauri project window', () => {
  it('starts the embedded backend through IPC and renders the native application', async () => {
    await expect($('h1=Data Loader')).toBeDisplayed();
    await browser.waitUntil(async () => (await backendStatus()).status === 'ready');
    const status = await backendStatus();
    expect(status).toEqual({
      status: 'ready',
      url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
    });
    await expect($('[aria-label="Data Block graph"]')).toBeDisplayed();
    expect(await browser.getUrl()).not.toContain('127.0.0.1');
    expect(await browser.getWindowHandles()).toHaveLength(1);
  });

  it('runs and paginates SQL once, preserving saved source across a webview reload', async () => {
    const status = await backendStatus();
    await $('button=Preprocessing').click();
    // The embedded driver emits mouse events; our draggable tabs use Pointer Events.
    // Exercise their real keyboard activation rather than synthesizing app events.
    await $('#preprocessing-tab-sql').click();
    await browser.keys('Enter');
    const editor = $('[data-testid="sql-console"] .cm-content');
    await editor.setValue(
      'CREATE TABLE native_test AS SELECT range AS n FROM range(45); SELECT n, 9007199254740993::BIGINT AS exact FROM native_test;',
    );
    await $('button[aria-label="Run cell 1"]').click();
    await expect($('[data-testid="sql-console"]')).toHaveText(
      expect.stringContaining('2 statements completed · 45 displayed rows'),
    );
    await expect($('//td[text()="9007199254740993"]')).toBeDisplayed();
    await $('a[aria-label="Go to next page"]').click();
    await expect($('//td[text()="20"]')).toBeDisplayed();
    // A reload reconnects to the same runtime; neither SQL nor its mutation reruns.
    await browser.refresh();
    await $('button=Preprocessing').click();
    // The embedded driver emits mouse events; our draggable tabs use Pointer Events.
    // Exercise their real keyboard activation rather than synthesizing app events.
    await $('#preprocessing-tab-sql').click();
    await browser.keys('Enter');
    await expect(editor).toHaveText(expect.stringContaining('CREATE TABLE native_test'));
    await expect($('[data-testid="sql-console"]')).not.toHaveText(
      expect.stringContaining('statements completed'),
    );
    expect(await backendStatus()).toEqual(status);
  });

  it('imports a recent local file through the native in-pane workspace in both themes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordflow-loader-'));
    const file = join(directory, 'native_loader.csv');
    await writeFile(file, 'id,text\n1,Native import\n');
    const previousRecents = await browser.execute(() => localStorage.getItem('wordflow.desktop.recentDataFiles'));
    const previousTheme = await $('html').getAttribute('data-theme');
    await browser.execute((path) => { localStorage.setItem('wordflow.desktop.recentDataFiles', JSON.stringify([path])); }, file);
    await browser.refresh();
    try {
      await $('button*=native_loader.csv').click();
      await expect($('[aria-label="Select native_loader"]')).toBeDisplayed();
      const recent = $('[aria-label="Import native_loader.csv"]');
      await expect(recent).toHaveText(expect.stringContaining('24 B'));
      await expect(recent.$('img')).toHaveAttribute('src', '/icons/material/table.svg');
      for (const dark of [false, true]) {
        await $('button[aria-label="Open settings"]').click();
        const toggle = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
        if (((await toggle.getAttribute('aria-checked')) === 'true') !== dark) await toggle.click();
        await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
        // Capture the settled theme after startup, outside the colour transition.
        await browser.refresh();
        await expect($('h1=Data Loader')).toBeDisplayed();
        await expect(recent).toHaveText(expect.stringContaining('24 B'));
        await browser.saveScreenshot(`.tmp/wdio/data-loader-native-${dark ? 'dark' : 'light'}.png`);
        await $('button[role="tab"]=LDaCA').click();
        await $('button[role="tab"]=Local files').click();
        await expect(recent).toBeDisplayed();
      }
      await recent.click();
      await expect($('[data-testid="local-import-file"]')).not.toExist();
      await expect($('[aria-label="Select native_loader_2"]')).toBeDisplayed();
      await expect($('[data-testid="project-data-overlay"]')).not.toExist();
    } finally {
      await browser.execute((value) => {
        if (value === null) localStorage.removeItem('wordflow.desktop.recentDataFiles');
        else localStorage.setItem('wordflow.desktop.recentDataFiles', value);
      }, previousRecents);
      if ((await $('html').getAttribute('data-theme')) !== previousTheme) {
        await $('button[aria-label="Open settings"]').click();
        await $('[role="switch"][aria-label="Use Dark 2026 theme"]').click();
        await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('toggles a single native preview and switches data in both themes', async () => {
    const status = await backendStatus();
    if (!status.url) throw new Error('Backend is not ready');
    const seeded = await fetch(`${status.url}/api/project/sql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        script:
          "CREATE TABLE preview_alpha AS SELECT 11 AS value; CREATE TABLE preview_beta AS SELECT 22 AS value; INSERT INTO wordflow.nodes(table_name) VALUES ('preview_alpha'), ('preview_beta')",
        response: 'command',
      }),
    });
    if (!seeded.ok) throw new Error(await seeded.text());
    await browser.refresh();
    const title = () => $('[data-testid="project-data-node-label"]');
    const eye = () => $('button[aria-label="Preview data"]');
    const show = async (name: string) => {
      await $(`.react-flow__node[data-id="${name}"] [aria-keyshortcuts="Enter"]`).execute(
        (element) => {
          element.focus();
        },
      );
      await browser.keys('Enter');
      await expect(eye()).toBeFocused();
      // The embedded driver dispatches Enter but does not perform native button activation.
      await eye().click();
    };
    const viewport = $('.react-flow__viewport');
    await $('.react-flow__node[data-id="preview_alpha"]').waitForDisplayed();
    await viewport.waitForStable();
    const position = await viewport.getAttribute('style');
    const originalTheme = await $('html').getAttribute('data-theme');
    try {
      for (const dark of [false, true]) {
        await $('button[aria-label="Open settings"]').click();
        const theme = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
        if (((await theme.getAttribute('aria-checked')) === 'true') !== dark) await theme.click();
        await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
        await show('preview_alpha');
        await expect(title()).toHaveText('preview_alpha');
        await expect(eye()).toHaveAttribute('aria-pressed', 'true');
        await expect($('//td[normalize-space(.)="11"]')).toBeDisplayed();
        await $('[aria-label="Resize graph and data panels"]').click();
        await browser.keys('End');
        await expect($('[data-testid="project-data-overlay"] [role="tab"]')).not.toExist();
        await show('preview_beta');
        await expect(title()).toHaveText('preview_beta');
        await expect($('//td[normalize-space(.)="22"]')).toBeDisplayed();
        await expect($('[role="button"][aria-label="Select preview_alpha"]')).toBeDisplayed();
        await expect($('[role="button"][aria-label="Select preview_beta"]')).toBeDisplayed();
        expect(await viewport.getAttribute('style')).toBe(position);
        await browser.saveScreenshot(`.tmp/wdio/single-preview-${dark ? 'dark' : 'light'}.png`);
        await show('preview_beta');
        await expect($('[data-testid="project-data-overlay"]')).not.toExist();
        await expect(eye()).toHaveAttribute('aria-pressed', 'false');
      }
    } finally {
      if ((await $('html').getAttribute('data-theme')) !== originalTheme) {
        await $('button[aria-label="Open settings"]').click();
        await $('[role="switch"][aria-label="Use Dark 2026 theme"]').click();
        await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
      }
    }
  });

  it('renders native settings in both themes', async () => {
    await $('button[aria-label="Open settings"]').click();
    const toggle = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    const original = await toggle.getAttribute('aria-checked');
    try {
      for (const dark of [false, true]) {
        if (((await toggle.getAttribute('aria-checked')) === 'true') !== dark) await toggle.click();
        await expect($('html')).toHaveAttribute('data-theme', dark ? 'dark-2026' : 'light-2026');
        await browser.saveScreenshot(`.tmp/wdio/settings-${dark ? 'dark' : 'light'}.png`);
      }
    } finally {
      if ((await toggle.getAttribute('aria-checked')) !== original) await toggle.click();
      await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    }
  });
});
