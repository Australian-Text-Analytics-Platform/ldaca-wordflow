import { browser, $, expect } from '@wdio/globals';
import * as projectApi from '@/features/project/api';
import * as analysesApi from '@/features/tools/common/analysisApi';

async function seed(base: string) {
  await projectApi.executeSql(base, [
    { sql: "CREATE TABLE data.mod_input AS SELECT 'cat dog cat' AS text, 1 AS n" },
    { sql: "INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('mod_input','text')" },
    { sql: "INSERT INTO wordflow.tokenizer_models VALUES ('mod_input','text','native:plain_words_en')" },
  ], { all: true });
  await browser.refresh();
}

export async function directInputsAndBuilder(
  base: string,
  addFromGraph?: () => Promise<void>,
  destinationActivation: 'keyboard' | 'pointer' = 'keyboard',
) {
  await seed(base);
  await $('button=Preprocessing').click();
  const source = $('[data-id="mod_input"]');
  const add = addFromGraph ?? (() => source.doubleClick());
  await expect($('label=Preprocessing Inputs (0/1)')).toBeDisplayed();
  await add();
  await expect($('label=Preprocessing Inputs (1/1)')).toBeDisplayed();
  await add();
  await expect($('li*=Already added')).toBeDisplayed();
  await $('#preprocessing-tab-join').click();
  await browser.keys('Enter');
  await add();
  const chooser = $('[role="dialog"]');
  await expect(chooser.$('h2=Add to input')).toBeDisplayed();
  await browser.keys('Escape');
  await expect(chooser).not.toExist();
  await add();
  await chooser.$('button=Left input').click();
  await expect(chooser).not.toExist();
  await expect($('label=Left input (1/1)')).toBeDisplayed();
  await add();
  if (destinationActivation === 'keyboard') {
    await (await chooser.$('button=Right input').getElement()).execute(el => el.focus());
    await browser.keys('Enter');
  } else {
    await chooser.$('button=Right input').click();
  }
  await expect(chooser).not.toExist();
  await expect($('label=Right input (1/1)')).toBeDisplayed();
  await $('#preprocessing-tab-build').click();
  await browser.keys('Enter');
  const pane = $('#preprocessing-panel-build');
  await add();
  await pane.$('[aria-label="Add column n"]').waitForDisplayed();
  await pane.$('[aria-label="Add column n"]').click();
  const columnName = pane.$('input[placeholder="col"]');
  await columnName.setValue('new_number');
  await pane.$('button=Edit SQL expression').click();
  const expression = pane.$('.cm-content');
  await expect(expression).toHaveText(expect.stringContaining('n'));
  await pane.$('button=New visual expression').click();
  await $('button=Keep SQL').click();
  await expect(expression).toHaveText(expect.stringContaining('n'));
  await $('button=Export').click();
  await $('button=Preprocessing').click();
  await expect(expression).toHaveText(expect.stringContaining('n'));
  await pane.$('button=New visual expression').click();
  await $('button=Start new expression').click();
  await expect(pane.$('.cm-content')).not.toExist();
  await expect(pane.$('[data-testid="build-bubble"]')).not.toExist();
  await expect(columnName).toHaveValue('new_number');
  await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  await browser.saveScreenshot('/tmp/wordflow-modularity-inputs.png');
}

export async function explicitSavedRequestReset(base: string) {
  await seed(base);
  await $('button=Frequency').click();
  await browser.waitUntil(async () => (await analysesApi.listTabs(base, undefined, 'frequency')).length === 1);
  const tab = (await analysesApi.listTabs(base, undefined, 'frequency'))[0]!;
  const original = { inputs: [], future_rule: { retain: 'original' } };
  await projectApi.executeSql(base, [{
    sql: 'INSERT INTO wordflow.analyses(id,tab_id,request) VALUES (gen_random_uuid(),?,?::JSON)',
    parameters: [tab.id, JSON.stringify(original)],
  }], { resources: ['tabs'] });
  await browser.refresh();
  await $('button=Frequency').click();
  await expect($('button=Start with current defaults')).toBeDisplayed();
  await expect($('button=Run')).toHaveAttribute('aria-disabled', 'true');
  await $('button=Start with current defaults').click();
  expect((await analysesApi.listTabs(base, undefined, 'frequency'))[0]?.analysis?.request).toEqual(original);
  await $('button=Add data block').click();
  await $('button=mod_input').click();
  await expect($('button=Run')).toHaveAttribute('aria-disabled', 'false');
  await $('button=Concordance').click();
  await $('button=Frequency').click();
  await expect($('button=Start with current defaults')).not.toExist();
  await expect($('button=Run')).toHaveAttribute('aria-disabled', 'false');
  await $('button=Run').click();
  await browser.waitUntil(async () => {
    const latest = (await analysesApi.listTabs(base, undefined, 'frequency'))[0]?.analysis;
    return latest?.has_result === true && latest.request_status.status === 'supported';
  }, { timeout: 60000 });
  expect((await analysesApi.listTabs(base, undefined, 'frequency'))[0]?.analysis?.request).toEqual({
    inputs: [{ source: { schema: 'data', name: 'mod_input' }, column: 'text', tokenizer: 'native:plain_words_en' }],
  });
  await browser.saveScreenshot('/tmp/wordflow-modularity-reset.png');
}
