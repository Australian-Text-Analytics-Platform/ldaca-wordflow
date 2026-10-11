import { it } from 'mocha';
import { $, browser, expect } from '@wdio/globals';
import { withExecuteOptions } from '@wdio/tauri-service';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getTestPreferences, setTestPreferences } from '../e2e-browser/fixtures';

it('persists native preferences across reload and synchronizes independent project windows', async () => {
  const binary = process.env.WORDFLOW_E2E_BINARY;
  if (!binary) throw new Error('Native Test binary is required');
  await setTestPreferences({guidance:{resetAcknowledgments:true}});
  const initial = await browser.getWindowHandle();
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-preferences-'));
  const path = join(directory, 'preferences-window.wfpj');
  let other: string | undefined;
  try {
    const status = await browser.tauri.execute(({ core }) => core.invoke('get_backend_status') as Promise<{url:string}>);
    const snapshot = await fetch(`${status.url}/api/project/exports`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({kind:'complete_project'}) });
    expect(snapshot.ok).toBe(true);
    await writeFile(path, new Uint8Array(await snapshot.arrayBuffer()));
    await promisify(execFile)(binary, [path], {timeout:30000});
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2);
    other = (await browser.getWindowHandles()).find((id) => id !== initial);
    if (!other) throw new Error('Second native project window did not open');
    await browser.switchToWindow(other);
    await $('h1=Data Loader').waitForDisplayed();
    await setTestPreferences({theme:'dark-2026',layout:{sidebarWidth:280},hiddenTools:['plots'],guidance:{enabled:false,acknowledge:{id:'export.setup',version:1}}});
    await expect($('html')).toHaveAttribute('data-theme','dark-2026');
    await browser.switchToWindow(initial);
    await expect($('html')).toHaveAttribute('data-theme','dark-2026');
    expect((await getTestPreferences()).layout.sidebarWidth).toBe(280);
    await expect($('[data-testid="sidebar-section-tools"]').$('button=Plots')).not.toExist();
    await expect($('[data-testid="sidebar-section-tools"]').$('button=Data Loader')).toBeDisplayed();
    expect((await getTestPreferences()).guidance).toEqual({enabled:false,acknowledgments:{'export.setup':1}});
    await browser.refresh();
    await expect($('html')).toHaveAttribute('data-theme','dark-2026');
    expect((await getTestPreferences()).layout.sidebarWidth).toBe(280);
    expect((await getTestPreferences()).hiddenTools).toEqual(['plots']);
    expect((await getTestPreferences()).guidance).toEqual({enabled:false,acknowledgments:{'export.setup':1}});
  } finally {
    try {
      if (other) {
        await browser.switchToWindow(other);
        await browser.execute(() => window.__wordflowDiagnostics?.prepareForNavigation());
        await browser.switchToWindow(initial);
        await browser.tauri.execute(({ core }, label: string) => core.invoke('plugin:window|close', {label}), withExecuteOptions({windowLabel:initial}), other);
        await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes(other!));
      }
    } finally { await rm(directory,{recursive:true,force:true}); }
  }
});
