import { browser, $, expect } from '@wdio/globals';
import * as api from '../../src/features/project/api';
import { expectAppError } from '../../e2e-browser/diagnostics';
import type { AnnotationProvider } from './annotationProvider';
import { readResearchData } from './researchData';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import {
  addResearchInput,
  chooseColumn,
  prepareResearchVisit,
  withResearchFile,
  researchScreenshot,
  setResearchTheme,
} from './researchData';

/** Real files and imports exercise labels, materialization, typed keys and Codebook review. */
interface AnnotationRow {
  rowid: string;
  text: string | null;
  label: string | null;
  correction: string | null;
  reference: string;
  region: string;
  count: number;
}
async function sourceRows(base: string, source: string) {
  return (
    await api.querySql(base, [
      { sql: `SELECT * FROM data.${api.identifier(source)} ORDER BY count` },
    ])
  )
    .toArray()
    .map((r: Record<string, unknown>) => ({ ...r, count: Number(r.count) }));
}
export async function annotationManualScenario(base: string) {
  const original = await readResearchData<AnnotationRow>('annotation-documents.json');
  await prepareResearchVisit();
  await withResearchFile('annotation-documents.json', 'annotation_docs', async () => {
    await withResearchFile('annotation-codebook.json', 'annotation_codes', async () => {
      await $('button=Annotation').click();
      const request = $('[aria-label="Annotation request"]');
      await addResearchInput(request, 'annotation_docs');
      const document = request.$('[aria-label^="Document column"]');
      if (await document.isExisting()) {
        await chooseColumn((await document.getAttribute('aria-label')) ?? '', 'text', request);
      }
      const materialize = request.$('button=Materialize in place');
      if (await materialize.isExisting()) await materialize.click();
      await chooseColumn('Annotation column', 'label', request);
      await chooseColumn('Correction column', 'correction', request);
      await chooseColumn('Codebook', 'annotation_codes', request);
      await chooseColumn('Code column', 'code', request);
      await chooseColumn('Description column', 'description', request);
      await request.$('button=Start').waitForEnabled();
      await request.$('button=Start').click();
      const review = $('[aria-label="Manual Annotation"]');
      const label = () => review.$('[role="combobox"][aria-label="Edit label"]');
      await expect(label()).toHaveText('obsolete (not in current Codebook)');
      await label().click();
      await $('[role="option"]=B').click();
      await expect(label()).toHaveText('B');
      await review.$('[aria-label="Go to next page"]').click();
      await review.$('[aria-label="Go to previous page"]').click();
      await expect(label()).toHaveText('B');
      await $('button=Frequency').click();
      await $('[role="alertdialog"]').$('button=Stay').click();
      await expect(label()).toHaveText('B');
      expect(await sourceRows(base, 'annotation_docs')).toEqual(original);
      await researchScreenshot('annotation-manual-light', review);
      await review.$('button=Save').click();
      await review.waitForExist({ reverse: true });
      expect(await sourceRows(base, 'annotation_docs')).toEqual(
        original.map((r, i) => (i === 0 ? { ...r, label: 'B' } : r)),
      );
      await request.$('button=Start').click();
      await expect(label()).toHaveText('B');
      await request.$('button=Close').click();
      await review.waitForExist({ reverse: true });
      await setResearchTheme(true);
      await request.$('button=Start').click();
      await researchScreenshot('annotation-manual-dark', review);
      await setAnalysisPaneSize('narrow');
      await researchScreenshot('annotation-manual-narrow-dark', review);
      expect(
        await review.execute((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
      await setAnalysisPaneSize('normal');
      await label().click();
      await $('[role="option"]=None').click();
      await review.$('button=Cancel').click();
      await review.waitForExist({ reverse: true });
      await setResearchTheme(false);
      await browser.refresh();
      await $('button=Annotation').click();
      await expect(request.$('[aria-label="Annotation column"]')).toHaveText('label');
      await expect(review).not.toExist();
      expect(await sourceRows(base, 'annotation_docs')).toEqual(
        original.map((r, i) => (i === 0 ? { ...r, label: 'B' } : r)),
      );
    });
  });
}

export async function annotationAiScenario(base: string, provider?: AnnotationProvider) {
  const endpoint = provider?.endpoint;
  const original = await readResearchData<AnnotationRow>('annotation-documents.json');
  await prepareResearchVisit();
  const sourceName = endpoint ? 'annotation_ai_docs' : 'annotation_apple_docs';
  const codebookName = endpoint ? 'annotation_ai_codes' : 'annotation_apple_codes';
  await withResearchFile('annotation-documents.json', sourceName, async () => {
    await withResearchFile('annotation-codebook.json', codebookName, async () => {
      await $('button=Annotation').click();
      const selectedTab = '[aria-label="Annotation analyses"] [role="tab"][aria-selected="true"]';
      const previousTab = await $(selectedTab).getText();
      await $('[aria-label="Annotation analyses"] button[aria-label="New tab"]').click();
      await browser.waitUntil(async () => (await $(selectedTab).getText()) !== previousTab);
      const request = $('[aria-label="Annotation request"]');
      await addResearchInput(request, sourceName);
      const document = request.$('[aria-label^="Document column"]');
      if (await document.isExisting())
        await chooseColumn((await document.getAttribute('aria-label')) ?? '', 'text', request);
      const materialize = request.$('button=Materialize in place');
      if (await materialize.isExisting()) await materialize.click();
      await chooseColumn('Annotation column', 'label', request);
      await chooseColumn('Correction column', 'correction', request);
      await chooseColumn('Codebook', codebookName, request);
      await chooseColumn('Code column', 'code', request);
      await chooseColumn('Description column', 'description', request);
      await request.$('[role="tab"]=AI').click();
      const parameters = $('[aria-label="AI Annotation parameters"]');
      if (endpoint) {
        await parameters.$('button=New connection').click();
        const dialog = $('[role="dialog"]');
        await dialog.$('[aria-label="Connection name"]').setValue('Synthetic provider');
        await chooseColumn('Provider', 'custom', dialog);
        await dialog.$('[aria-label="API endpoint"]').setValue(endpoint);
        await chooseColumn('Credential', 'No key / remove key', dialog);
        await dialog.$('button=Save').click();
        await dialog.waitForExist({ reverse: true });
        await parameters.$('[aria-label="AI model name"]').setValue('synthetic-annotation');
      } else {
        await chooseColumn('AI connection', 'Apple Foundation Models (on-device)', parameters);
      }
      await parameters.$('summary=Advanced settings and examples').click();
      if (provider) {
        await parameters.$('label*=Batch size').$('input').setValue('7');
        await parameters.$('label*=Retries').$('input').setValue('1');
        await parameters.$('label*=Concurrent requests').$('input').setValue('2');
      }
      await setAnalysisPaneSize('narrow');
      await researchScreenshot('annotation-ai-parameters-narrow', parameters);
      expect(
        await parameters.execute((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
      await setAnalysisPaneSize('normal');
      await parameters.$('summary=Advanced settings and examples').click();
      await parameters.$('button=Preview').click();
      const preview = $('[aria-label="Annotation Preview"]');
      await preview.$('th=Prediction').waitForDisplayed({ timeout: 60000 });
      const predictions = await preview
        .$('tbody')
        .$$('tr')
        .map((row) => row.$('td:first-child').getText());
      expect(predictions.length).toBe(10);
      expect(predictions.filter((value) => !['A', 'B', 'None'].includes(value))).toEqual([]);
      if (provider) {
        expect(predictions).toEqual(
          original.slice(0, 10).map((r) => (r.text?.includes('transport') ? 'B' : 'None')),
        );
        expect(await sourceRows(base, sourceName)).toEqual(original);
        const before = provider.requests();
        await preview.$('[aria-label="Go to next page"]').click();
        await browser.waitUntil(() => provider.requests() > before);
        await preview.$('th=Prediction').waitForDisplayed();
        await preview.$('[aria-label="Go to previous page"]').click();
        await browser.waitUntil(() => provider.requests() > before + 1);
        await preview.$('th=Prediction').waitForDisplayed();
        expect(await sourceRows(base, sourceName)).toEqual(original);
      }
      await preview.$('button=Edit corrections').click();
      const correction = preview.$('[aria-label="Edit correction"]');
      await correction.waitForEnabled();
      await correction.click();
      await $('[role="option"]=B').click();
      await expect(preview).toHaveText(expect.stringContaining('Includes unsaved changes'));
      await parameters.$('button=Clear results').click();
      await expect(preview).toHaveText(expect.stringContaining('correction draft is retained'));
      await preview.$('button=Save').click();
      await preview.waitForExist({ reverse: true });
      const corrected = original.map((r, i) => (i === 0 ? { ...r, correction: 'B' } : r));
      if (provider) {
        expect(await sourceRows(base, sourceName)).toEqual(corrected);
        await chooseColumn('Annotation processing', 'Fill missing only', parameters);
      }
      await parameters.$('button=Run').click();
      const results = $('[aria-label="Annotation Results"]');
      await results.waitForDisplayed({ timeout: 90000 });
      await results.$('p*=Historical Run:').waitForDisplayed({ timeout: 90000 });
      if (provider) {
        const predict = (row: AnnotationRow) => (row.text?.includes('transport') ? 'B' : null);
        const missing = corrected.map((r) =>
          r.text?.trim() && !r.label?.trim() ? { ...r, label: predict(r) } : r,
        );
        expect(await sourceRows(base, sourceName)).toEqual(missing);
        provider.setMode('partial');
        await chooseColumn('Annotation processing', 'Reprocess all', parameters);
        const partialStart = provider.requests();
        await parameters.$('button=Run').click();
        await browser.waitUntil(() => provider.requests() > partialStart);
        await browser.waitUntil(async () =>
          (await api.getTasks(base)).tasks.every((t) => t.finished_at !== null),
        );
        const completed = corrected.map((r) => (r.text?.trim() ? { ...r, label: predict(r) } : r));
        expect(await sourceRows(base, sourceName)).toEqual(
          completed.map((r, i) => (i === 11 ? { ...r, label: original[i]?.label } : r)),
        );
        const partial = (await api.listTabs(base, undefined, 'annotation')).find(
          (t) => t.analysis?.has_result,
        )?.analysis;
        if (!partial) throw new Error('Missing partial report');
        const partialResult = await api.getAnnotationResult(base, partial.id);
        if (!partialResult) throw new Error('Partial Annotation report has no saved output');
        const partialReport = partialResult.report;
        expect([partialReport.processed, partialReport.skipped, partialReport.failed]).toEqual([
          35, 3, 1,
        ]);
        await expect(parameters.$('button=Rerun')).toHaveAttribute('aria-disabled', 'false');
        provider.setMode('success');
        const before = provider.calls.length;
        await parameters.$('button=Rerun').click();
        await browser.waitUntil(() => provider.calls.length > before);
        await browser.waitUntil(async () =>
          (await api.getTasks(base)).tasks.every((t) => t.finished_at !== null),
        );
        expect(await sourceRows(base, sourceName)).toEqual(completed);
        expect(provider.calls.slice(before).flat().sort()).toEqual(
          original.flatMap((r) => (r.text?.trim() ? [r.text] : [])).sort(),
        );
        expect(provider.calls.every((batch) => batch.length <= 7)).toBe(true);
        expect(provider.peak()).toBeLessThanOrEqual(2);
        const tab = (await api.listTabs(base, undefined, 'annotation')).find(
          (t) => t.analysis?.has_result,
        );
        if (!tab?.analysis) throw new Error('Missing completed Annotation');
        const saved = await api.getAnnotationResult(base, tab.analysis.id);
        if (!saved) throw new Error('Completed Annotation analysis has no saved output');
        const report = saved.report;
        expect([report.processed, report.skipped, report.failed]).toEqual([36, 3, 0]);
      }
      await expect(parameters.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
      await results.$('button=Captured Codebook and examples').click();
      const context = results.$('[aria-label="Captured inference context"]');
      await expect(context.$('table')).toHaveText(expect.stringContaining('Description'));
      await context.$('summary=Raw JSON').click();
      await expect(context.$('pre')).toHaveText(expect.stringContaining('description'));
      await researchScreenshot('annotation-ai-light', results);
      await setResearchTheme(true);
      await researchScreenshot('annotation-ai-dark', results);
      await setResearchTheme(false);
      await parameters.$('button=Clear results').click();
      await results.waitForExist({ reverse: true });
      await expect(parameters.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
      if (provider) {
        const savedRows = await sourceRows(base, sourceName);
        provider.setMode('authentication');
        expectAppError(/HTTP 401: Check the connection API key/);
        const before = provider.requests();
        await parameters.$('button=Run').click();
        await browser.waitUntil(() => provider.requests() > before);
        await browser.waitUntil(async () =>
          (await api.getTasks(base)).tasks.some(
            (t) => t.error?.code === 'annotation_provider_authentication_failed',
          ),
        );
        expect(provider.requests() - before).toBeLessThanOrEqual(2);
        expect(await sourceRows(base, sourceName)).toEqual(savedRows);
        const failed = (await api.listTabs(base, undefined, 'annotation')).find((t) => t.analysis);
        expect(failed?.analysis?.has_result).toBe(false);
        expect(failed?.analysis?.request).toHaveProperty('processing', 'all');
        await expect(results).not.toExist();
        provider.setMode('hold');
        const start = provider.requests();
        await expect(parameters.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
        await parameters.$('button=Run').click();
        await browser.waitUntil(() => provider.requests() > start);
        await expect(parameters.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
        const active = (await api.getTasks(base)).tasks.find((t) => t.finished_at === null);
        if (!active) throw new Error('Held Annotation task is not active');
        await $('[aria-label="Analysis progress"]').$('button=Cancel').click();
        await browser.waitUntil(async () =>
          (await api.getTasks(base)).tasks.some(
            (t) => t.id === active.id && ['cancelling', 'cancelled'].includes(t.state),
          ),
        );
        provider.release();
        await browser.waitUntil(async () =>
          (await api.getTasks(base)).tasks.some(
            (t) => t.id === active.id && t.state === 'cancelled',
          ),
        );
        expect(await sourceRows(base, sourceName)).toEqual(savedRows);
        await expect(results).not.toExist();
        await expect(parameters.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
      }
    });
  });
}
