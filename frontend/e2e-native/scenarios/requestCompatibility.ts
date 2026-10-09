import { outputAnalysisId } from './analysisState';
import { browser, $, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as projectApi from '@/features/project/api';
import * as objectsApi from '@/features/project/objects';
import * as analysesApi from '@/features/tools/common/analysisApi';
import {
  emptyConcordance,
  decodeAnalysisRequest,
} from '../../src/features/tools/common/analysisRequest';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { researchScreenshot, setResearchTheme } from './researchData';

export const compatibilityKinds = [
  'frequency',
  'concordance',
  'quotation',
  'trends',
  'compare',
  'scatter',
  'heatmap',
  'sankey',
  'topic-modeling',
  'annotation',
] as const;

export async function requestCompatibilityScenario(
  base: string,
  prefix: string,
  kind: (typeof compatibilityKinds)[number],
) {
  const name = `${prefix}_compatibility`;
  await projectApi.executeSql(
    base,
    [
      { sql: `CREATE TABLE ${ objectsApi.identifier(name)} (text VARCHAR)` },
      { sql: `INSERT INTO ${ objectsApi.identifier(name)} VALUES ('cat dog')` },
      {
        sql: 'INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?, ?)',
        parameters: [name, 'text'],
      },
    ],
    { objects: [{ schema: 'data', name }], resources: ['graph'] },
  );
  const input = { source: { schema: 'data', name }, column: 'text' };
  const title =
    kind === 'topic-modeling' ? 'Topic Modelling' : kind.charAt(0).toUpperCase() + kind.slice(1);
  const plot = ['trends', 'compare', 'scatter', 'heatmap', 'sankey'].includes(kind);
  const tab = await analysesApi.createTab(base, kind, `${title} compatibility`);
  const supported =
    kind === 'quotation'
      ? { input }
      : kind === 'frequency' || kind === 'concordance'
        ? {
            inputs: [
              { ...input, tokenizer: kind === 'frequency' ? 'native:plain_words_en' : null },
            ],
            ...(kind === 'concordance'
              ? { search: { ...emptyConcordance.search, query: 'cat' } }
              : {}),
          }
        : decodeAnalysisRequest(kind, undefined).request;
  const original = {
    ...supported,
    future_setting: {
      explanation: '<b>Keep this original JSON</b>',
      long_value: 'future '.repeat(100),
    },
  };
  await projectApi.executeSql(
    base,
    [
      {
        sql: 'INSERT INTO wordflow.analyses(id,tab_id,request) VALUES (uuid(),?,?)',
        parameters: [tab.id, JSON.stringify(original)],
      },
    ],
    { resources: ['tabs'] },
  );
  await browser.refresh();
  await $(`button[aria-label="${plot ? 'Plots' : title}"]`).waitForEnabled();
  await $(`button[aria-label="${plot ? 'Plots' : title}"]`).click();
  if (plot) await $('[role="tablist"][aria-label="Plot modes"]').$(`[role="tab"]=${title}`).click();
  const compatibilityTab = $(`[role="tab"]*=${title} compatibility`);
  await compatibilityTab.execute((element) => {
    element.focus();
  });
  await browser.keys(Key.Enter);
  await expect(compatibilityTab).toHaveAttribute('aria-selected', 'true');
  if (kind === 'annotation')
    await $('[aria-label="Annotation request"]').$('[role="tab"]=AI').click();
  const warning = $('[aria-label="Saved settings compatibility"]');
  await warning.waitForDisplayed();
  await warning.$('summary').click();
  await expect(warning.$('pre')).toHaveText(
    expect.stringContaining('<b>Keep this original JSON</b>'),
  );
  await expect(warning.$('b')).not.toExist();
  for (const theme of ['light', 'dark']) {
    await $('button[aria-label="Open settings"]').click();
    const dark = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    if (((await dark.getAttribute('aria-checked')) === 'true') !== (theme === 'dark'))
      await dark.click();
    await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    for (const narrow of [false, true]) {
      await setAnalysisPaneSize(narrow ? 'narrow' : 'normal');
      await warning.scrollIntoView({ block: 'center' });
      await researchScreenshot(
        `${prefix}-${kind}-compatibility-${theme}${narrow ? '-narrow' : ''}`,
        warning,
      );
    }
  }
  await setAnalysisPaneSize('normal');
  await setResearchTheme(false);
  expect(
    (await analysesApi.listTabs(base, undefined, kind)).find((t) => t.id === tab.id)?.analysis?.request,
  ).toEqual(original);
  const reset = warning.$('button=Start with current defaults');
  await expect(reset).toBeDisplayed();
  if (kind === 'frequency')
    await expect($('button=Run')).toHaveAttribute('aria-disabled', 'true');
  await reset.click();
  await expect(reset).not.toExist();
  await expect(warning.$('pre')).toHaveText(
    expect.stringContaining('<b>Keep this original JSON</b>'),
  );
  expect(
    (await analysesApi.listTabs(base, undefined, kind)).find((t) => t.id === tab.id)?.analysis?.request,
  ).toEqual(original);
  // Reset changes only the draft. An accepted Run persists the newly configured request.
  if (kind === 'frequency') {
    const run = $('button=Run');
    await expect(run).toHaveAttribute('aria-disabled', 'true');
    await $('button=Add data block').click();
    await $(`button=${name}`).click();
    await expect(run).toHaveAttribute('aria-disabled', 'false');
    expect(
      (await analysesApi.listTabs(base, undefined, kind)).find((t) => t.id === tab.id)?.analysis?.request,
    ).toEqual(original);
    await run.click();
    await browser.waitUntil(async () =>
      Boolean(
        outputAnalysisId((await analysesApi.listTabs(base, undefined, kind)).find((t) => t.id === tab.id)),
      ),
    );
    await warning.waitForExist({ reverse: true });
    expect(
      (await analysesApi.listTabs(base, undefined, kind)).find((t) => t.id === tab.id)?.analysis?.request,
    ).toEqual(supported);
  }
}
