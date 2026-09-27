import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { browser, $, expect } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';
import * as api from '../../src/features/project/api';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { outputDir } from '../../e2e-browser/fixtures';

export const researchDirectory = resolve(import.meta.dirname, '../../e2e/fixtures/data');
export interface SurveyRow {
  row_id: number;
  day: string;
  recorded_at: string;
  topic: string;
  region: string;
  before: string | null;
  after: string | null;
  followup: string | null;
  x: number | null;
  y: number | null;
  weight: number;
  measurement: number | null;
  label: string;
}
export interface DocumentRow {
  document_id: string | number;
  text: string | null;
  topic: string;
  tags: string[];
}
export async function readResearchData<T>(file: string): Promise<T[]> {
  return JSON.parse(await readFile(join(researchDirectory, file), 'utf8')) as T[];
}

export async function prepareResearchVisit() {
  await browser.execute(() => {
    const style = document.createElement('style');
    style.textContent =
      '*,*::before,*::after {animation:none !important;transition:none !important;scroll-behavior:auto !important;}';
    document.head.append(style);
  });
  await setAnalysisPaneSize('normal');
}

// Files, import SQL, inference, tasks and registration are real. Only file delivery
// differs: browser path control versus the native Data Loader's file-drop channel.
export async function withResearchFile(
  file: string,
  name: string,
  visit: (source: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-research-'));
  const path = join(directory, name + extname(file));
  await copyFile(join(researchDirectory, file), path);
  const previousRecents = await browser.execute(() =>
    localStorage.getItem('wordflow.desktop.recentDataFiles'),
  );
  try {
    await $('button=Data Loader').click();
    await $('[role="tab"]=Local files').click();
    const input = $('input[aria-label="Data file path"]');
    if (await input.isExisting()) {
      await input.setValue(path);
      await $('button=Choose files…').click();
    } else {
      await $('[data-project-file-drop="loader"]').execute((element, filePath) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('application/x-wordflow-file', String(filePath));
        element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
      }, path);
    }
    await $(`[aria-label="Select ${name}"]`).waitForDisplayed({ timeout: 30000 });
    await expect($('[data-testid="project-data-overlay"]')).not.toExist();
    await visit(name);
  } finally {
    await browser.execute((value) => {
      if (value === null) localStorage.removeItem('wordflow.desktop.recentDataFiles');
      else localStorage.setItem('wordflow.desktop.recentDataFiles', value);
    }, previousRecents);
    await rm(directory, { recursive: true, force: true });
  }
}

export async function chooseColumn(label: string, value: string, scope: ChainablePromiseElement) {
  const trigger = scope.$(`[role="combobox"][aria-label=${JSON.stringify(label)}]`);
  await trigger.waitForEnabled();
  await trigger.click();
  // Radix Select also opens with the embedded driver's keyboard events.
  if (!(await $('[role="option"]').isExisting())) await browser.keys('ArrowDown');
  await $(`[role="option"]=${value}`).click();
  await expect(trigger).toHaveText(value);
}
export async function addResearchInput(scope: ChainablePromiseElement, name: string) {
  await scope.$('button=Add data block').waitForEnabled();
  await scope.$('button=Add data block').click();
  await $('[role="dialog"]').waitForDisplayed();
  await $('[role="dialog"]').$(`button=${name}`).click();
  await $('[role="dialog"]').waitForExist({ reverse: true });
}
export async function runResearchAnalysis(
  base: string,
  kind: api.AnalysisKind,
  scope: ChainablePromiseElement,
) {
  const before = new Set(
    (await api.listTabs(base, undefined, kind)).map((tab) => tab.analysis?.id),
  );
  await expect(scope.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
  await scope.$('button=Run').click();
  let id: string | undefined;
  await browser.waitUntil(
    async () => {
      id = (await api.listTabs(base, undefined, kind)).find(
        (tab) => tab.analysis?.has_result && !before.has(tab.analysis.id),
      )?.analysis?.id;
      return Boolean(id);
    },
    { timeout: 60000, timeoutMsg: `${kind} did not save its UI-submitted request` },
  );
  if (!id) throw new Error('Missing analysis ID');
  await expect(scope.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
  return id;
}
export async function researchScreenshot(name: string, scope: ChainablePromiseElement) {
  await scope.execute((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await browser.saveScreenshot(resolve(outputDir, `${name}.png`));
}
export async function setResearchTheme(dark: boolean) {
  await $('button[aria-label="Open settings"]').click();
  const toggle = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
  if (((await toggle.getAttribute('aria-checked')) === 'true') !== dark) await toggle.click();
  await browser.keys('Escape');
  await $('[role="dialog"]').waitForExist({ reverse: true });
}
