import { outputAnalysisId } from './analysisState';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { browser, $, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as api from '../../src/features/project/api';
import { requireQuotationModel } from '../../scripts/quotation-model.mjs';
export async function quotationScenario(base: string, prefix: string) {
  await requireQuotationModel();
  const name = `${prefix}_documents`;
  await api.executeSql(
    base,
    [
      { sql: `CREATE TABLE ${api.identifier(name)} (text VARCHAR,tags INTEGER[])` },
      {
        sql: `INSERT INTO ${api.identifier(name)} VALUES (?,[1,2]),(NULL,[]),('No quotations here.',[]),(?,[3])`,
        parameters: [
          '😀 Alice said, "The project will finish tomorrow morning."',
          'Alice said, "The project will finish tomorrow morning." She added, "The team will begin the following project next week."',
        ],
      },
      {
        sql: 'INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?)',
        parameters: [name, 'text'],
      },
    ],
    { objects: [{ schema: 'data', name }], resources: ['graph'] },
  );
  await browser.refresh();
  const disableAnimations = () =>
    browser.execute(() => {
      const style = document.createElement('style');
      style.textContent =
        '*,*::before,*::after {animation:none !important;transition:none !important;scroll-behavior:auto !important;}';
      document.head.append(style);
    });
  await disableAnimations();
  await $('button=Quotation').waitForEnabled();
  await $('button=Quotation').click();
  const workspace = $('[data-testid="quotation-workspace"]');
  await workspace.waitForDisplayed();
  await workspace.$('button=Add data block').click();
  await $('[role="dialog"]').$(`button=${name}`).click();
  await browser.keys(Key.Escape);
  const request = workspace.$('[aria-label="Quotation request"]');
  const results = workspace.$('[aria-label="Quotation results"]');
  await expect(request.$('button=Preview')).toHaveAttribute('aria-disabled', 'false');
  await request.$('button=Preview').click();
  await results.$('button[aria-label="Inspect document 1"]').waitForExist();
  await expect(results.$('[role="tab"]=Documents')).toHaveAttribute('aria-selected', 'true');
  await expect(results.$('button=Preview')).not.toExist();
  await expect(results.$('button=Saved results')).not.toExist();
  await results.$('[role="tab"]=Quotations').click();
  await expect(results.$$('button[aria-label^="Inspect document"]')).toBeElementsArrayOfSize(3);
  await results.$('[role="tab"]=Documents').click();
  await expect(results.$$('button[aria-label^="Inspect document"]')).toBeElementsArrayOfSize(2);
  await results.$('button*=Metadata and fields').click();
  const columns = $('[role="dialog"][aria-label="Quotation result columns"]');
  await columns.waitForDisplayed();
  await columns.$('label=tags').click();
  await browser.saveScreenshot(`.tmp/wdio/${prefix}-quotation-columns.png`);
  await browser.keys(Key.Escape);
  await columns.waitForExist({ reverse: true });
  await expect(results.$('th*=tags')).toExist();
  const tab = (await api.listTabs(base, undefined, 'quotation'))[0];
  if (!tab) throw new Error('Quotation tab missing');
  expect(outputAnalysisId(tab)).toBeNull();
  expect(tab.settings.preview).toBeUndefined();
  expect(tab.analysis).toBeNull();
  await $('button=Data Loader').click();
  await api.executeSql(
    base,
    [
      {
        sql: `UPDATE ${api.identifier(name)} SET text = ? WHERE tags = [1,2]`,
        parameters: ['😀 Alice said, "The revised project will finish next month."'],
      },
    ],
    { objects: [{ schema: 'data', name }] },
  );
  await browser.refresh();
  await $('button=Quotation').waitForEnabled();
  await $('button=Quotation').click();
  await expect(results).not.toExist();
  await disableAnimations();
  await workspace.$('button=Add data block').click();
  await $('[role="dialog"]').$(`button=${name}`).click();
  await browser.keys(Key.Escape);
  await expect(request.$('button=Preview')).toHaveAttribute('aria-disabled', 'false');
  await request.$('button=Preview').click();

  await expect(results).toHaveText(
    expect.stringContaining('The revised project will finish next month.'),
  );
  await disableAnimations();
  const records = await api.querySql(base, [
    {
      sql: 'SELECT count(*) AS count FROM wordflow.analyses WHERE tab_id = ?',
      parameters: [tab.id],
    },
  ]);
  expect(records.toArray().map((row: Record<string, unknown>) => String(row.count))).toEqual(['0']);
  expect(
    (await api.getTasks(base)).tasks.filter((task) => task.tab_id === tab.id),
  ).toHaveLength(0);
  await results.$('button[aria-label="Inspect document 1"]').click();
  await $('[role="dialog"]').waitForDisplayed();
  await browser.saveScreenshot(`.tmp/wdio/${prefix}-quotation-detail.png`);
  await browser.keys(Key.Escape);
  await expect(request.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
  await request.$('button=Run').scrollIntoView();
  await request.$('button=Run').click();
  let resultId: string | null = null;
  await browser.waitUntil(
    async () => {
      resultId =
        outputAnalysisId((await api.listTabs(base, undefined, 'quotation')).find((t) => t.id === tab.id)) ?? null;
      return Boolean(resultId);
    },
    { timeout: 30000 },
  );
  await expect(results.$('button=Saved results')).not.toExist();
  await expect(request.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
  await results.$('button=Add to Project').waitForEnabled();
  await results.$('button=Add to Project').execute((element) => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await results.$('button=Add to Project').click();
  await browser.keys(Key.ArrowDown);
  await $('[role="menuitem"]=Quotations').waitForDisplayed();
  await $('[role="menuitem"]=Quotations').click();
  const dialog = $('[role="dialog"][data-state="open"]');
  await dialog.waitForDisplayed();
  await browser.saveScreenshot(`.tmp/wdio/${prefix}-quotation-publish.png`);
  await dialog.$('button=Add').click();
  await dialog.waitForExist({ reverse: true });
  await browser.waitUntil(async () =>
    (await api.graph(base)).nodes.some((n) => n.table_name === `${name}_quotations`),
  );
  for (const theme of ['light', 'dark']) {
    await $('button[aria-label="Open settings"]').click();
    const dark = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    if (((await dark.getAttribute('aria-checked')) === 'true') !== (theme === 'dark'))
      await dark.click();
    await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    for (const narrow of [false, true]) {
      await setAnalysisPaneSize(narrow ? 'narrow' : 'normal');
      await results.execute((e) => {
        e.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await browser.saveScreenshot(
        `.tmp/wdio/${prefix}-quotation-${theme}${narrow ? '-narrow' : ''}.png`,
      );
    }
  }
  await setAnalysisPaneSize('normal');
  await api.executeSql(base, [{ sql: `DROP TABLE ${api.identifier(name)}` }], {
    objects: [{ schema: 'data', name }],
    resources: ['graph'],
  });
  await browser.refresh();
  await $('button=Quotation').waitForEnabled();
  await $('button=Quotation').click();
  await results.$('button[aria-label="Inspect document 1"]').waitForExist();
  const completed = (await api.listTabs(base, undefined, 'quotation')).find(
    (t) => t.id === tab.id,
  );
  const completedId = outputAnalysisId(completed);
  if (!completedId) throw new Error('Saved quotation result missing');
  const manifest = await api.getQuotationResult(base, completedId);
  if (!manifest) throw new Error('Completed Quotation analysis has no saved output');
  expect(manifest.result.payload.document_count).toBe(4);
  expect(manifest.result.payload.matching_documents).toBe(2);
  expect(manifest.result.payload.match_count).toBeGreaterThanOrEqual(3);
}
