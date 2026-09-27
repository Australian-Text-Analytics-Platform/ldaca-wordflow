import { it } from 'mocha';
import { browser, $, expect } from '@wdio/globals';
import { withExecuteOptions } from '@wdio/tauri-service';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as api from '../src/features/project/api';
import {
  withResearchFile,
  addResearchInput,
  chooseColumn,
  runResearchAnalysis,
} from './scenarios/researchData';

it('closes and reopens a saved project through native file opening, deduplicating its window', async function () {
  this.timeout(180000);
  const binary = process.env.WORDFLOW_E2E_BINARY;
  if (!binary) throw new Error('Native runner binary is required');
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-reopen-'));
  const path = join(directory, 'E2E research project — 语言.wfpj');
  const base = async () =>
    (
      await browser.tauri.execute(
        ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
        withExecuteOptions({ windowLabel: await browser.getWindowHandle() }),
      )
    ).url;
  const anchor = await browser.getWindowHandle();
  const initial = await base();
  const savedTabs = async (url: string) =>
    (await api.listTabs(url)).map((tab) => ({
      ...tab,
      analysis: tab.analysis && {
        ...tab.analysis,
        // Different runtime sessions can render the same instant in different zones.
        created_at: tab.analysis.created_at && new Date(tab.analysis.created_at).toISOString(),
      },
    }));
  let child: string | undefined;
  const openFile = async () => {
    await promisify(execFile)(binary, [path], { timeout: 30000 });
  };
  const closeChild = async () => {
    if (!child) return;
    const closing = child;
    await browser.switchToWindow(closing);
    await browser.execute(() => window.__wordflowDiagnostics?.prepareForNavigation());
    await browser.switchToWindow(anchor);
    // Receive the IPC reply in the surviving window, not in a closing WebView.
    await browser.tauri.execute(
      ({ core }, label: string) => core.invoke('plugin:window|close', { label }),
      closing,
    );
    await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes(closing));
    child = undefined;
  };
  try {
    await withResearchFile('public-discourse-reference.json', 'reopen_corpus', async () => {
      await $('button=Frequency').click();
      const panel = $('[data-testid="frequency-workspace"]');
      await addResearchInput(panel, 'reopen_corpus');
      await chooseColumn('Text Column:', 'text', panel);
      await chooseColumn('reopen_corpus tokenizer', 'Plain words (English)', panel);
      const id = await runResearchAnalysis(initial, 'frequency', panel);
      const tabs = await savedTabs(initial);
      // The native save chooser has a separate OS acceptance check. Generate this
      // disposable project with the real exporter, then exercise document coordination.
      const response = await fetch(`${initial}/api/project/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'complete_project' }),
      });
      expect(response.ok).toBe(true);
      await writeFile(path, new Uint8Array(await response.arrayBuffer()));
      for (let visit = 0; visit < 2; visit++) {
        await openFile();
        await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2);
        child = (await browser.getWindowHandles()).find((handle) => handle !== anchor);
        if (!child) throw new Error('Native project window did not open');
        await browser.switchToWindow(child);
        await $('button=Frequency').waitForEnabled();
        await $('button=Frequency').click();
        await $('[aria-label="Frequency results"]').waitForDisplayed();
        const url = await base();
        expect(url).not.toBe(initial);
        expect(await savedTabs(url)).toEqual(tabs);
        const counts = await api.queryFrequency(url, id, {
          view: 'corpus',
          corpus_index: 0,
          filter: 'policy',
        });
        expect(
          counts.table
            .toArray()
            .map((r: Record<string, unknown>) => [r.token, Number(r.frequency)]),
        ).toEqual([['policy', 333]]);
        expect((await api.getTasks(url)).tasks).toEqual([]);
        await openFile();
        expect(await browser.getWindowHandles()).toHaveLength(2);
        await closeChild();
      }
      // The original Untitled project's independent runtime is still intact.
      expect(await savedTabs(initial)).toEqual(tabs);
    });
  } finally {
    await closeChild();
    await rm(directory, { recursive: true, force: true });
  }
});
