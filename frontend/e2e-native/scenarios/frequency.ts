import { decodeAnalysisRequest } from '../../src/features/tools/common/analysisRequest';
import { outputAnalysisId } from './analysisState';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { expectAppError } from '../../e2e-browser/diagnostics';
import { browser, $, $$, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as api from '../../src/features/project/api';

declare global {
  interface Window {
    __frequencyNetworkProbe?: { urls: string[]; restore: () => void };
    __frequencyRefreshProbe?: { requests: number; events: number; restore: () => void };
    __frequencyCloudProbe?: { mutations: number; observer: MutationObserver };
  }
}

const workspace = () => $('[data-testid="frequency-workspace"]');
const tablist = () => $('[role="tablist"][aria-label="Frequency analyses"]');
const results = () => $('[aria-label="Frequency results"]');

async function openFrequency() {
  // The embedded driver's refresh returns before the new React tree is ready.
  await $('h1=Data Loader').waitForDisplayed();
  // Background native WebViews can suspend the frames needed by closing dialogs.
  // These scenarios test behavior and static layout, not transition animations.
  await browser.execute(() => {
    const style = document.createElement('style');
    style.textContent =
      '*,*::before,*::after { animation: none !important; transition: none !important; }';
    document.head.append(style);
  });
  await $('button=Frequency').waitForDisplayed();
  await $('button=Frequency').click();
  await workspace().waitForDisplayed();
  await tablist().waitForDisplayed();
}

async function showFrequencyContent(selector: string) {
  await browser.waitUntil(
    async () =>
      browser.execute((selector) => {
        const content = document.querySelector('[data-testid="frequency-content"]');
        const viewport = content?.querySelector('[data-radix-scroll-area-viewport]');
        const target = content?.querySelector(selector);
        if (!target || !viewport) return false;
        // The embedded driver's scrolling does not reach nested Radix viewports.
        // Re-query each time because loading a result replaces its placeholder section.
        target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
        const bounds = viewport.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top);
        return rect.height > 0 && visibleHeight >= Math.min(rect.height, bounds.height) * 0.9;
      }, selector),
    { timeoutMsg: `Frequency content is not visible in its scroll viewport: ${selector}` },
  );
}

async function showLoadedResults() {
  // Wait on saved-result controls, not the identically labelled loading placeholder.
  await browser.waitUntil(async () => results().$('button=Ranked lists').isExisting());
  await showFrequencyContent('[aria-label="Frequency results"]');
}

async function waitForCloudWords(selector: string) {
  await browser.waitUntil(
    async () =>
      browser.execute((selector) => {
        const clouds = [...document.querySelectorAll(selector)];
        return (
          clouds.length > 0 &&
          clouds.every((cloud) => {
            const svg = cloud.querySelector('svg');
            // Resize settles before the asynchronous word-cloud layout finishes.
            return (
              svg &&
              Math.abs(svg.width.baseVal.value - cloud.clientWidth) <= 1 &&
              [...svg.querySelectorAll('text')].some((word) => word.textContent.trim())
            );
          })
        );
      }, selector),
    { timeoutMsg: `Resized Frequency cloud has not rendered its words: ${selector}` },
  );
}

async function assertNoHorizontalOverflow() {
  try {
    await browser.waitUntil(
      async () => workspace().execute((element) => element.scrollWidth <= element.clientWidth + 1),
      { timeout: 5000 },
    );
  } catch {
    const geometry = await workspace().execute((element) => {
      const right = element.getBoundingClientRect().right;
      return {
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowing: [...element.querySelectorAll('*')]
          .filter((child) => child.getBoundingClientRect().right > right + 1)
          .slice(0, 20)
          .map((child) => ({
            tag: child.tagName,
            classes: child.getAttribute('class'),
            text: child.textContent.slice(0, 100),
            width: child.getBoundingClientRect().width,
          })),
      };
    });
    throw new Error(`Frequency pane overflows after resizing: ${JSON.stringify(geometry)}`);
  }
}

async function selectTab(base: string, id: string) {
  const tabs = await api.listTabs(base, undefined, 'frequency');
  const index = tabs.findIndex((tab) => tab.id === id);
  const tab = tablist().$$('[role="tab"]')[index];
  if (!tab) throw new Error(`Analysis tab ${id} is missing`);
  await tab.execute((element) => {
    element.focus();
  });
  await browser.keys('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function createTab(base: string, name: string) {
  const tabs = await api.listTabs(base, undefined, 'frequency');
  const existing = new Set(tabs.map((tab) => tab.id));
  // Use the initial empty tab; subsequent named analyses use the ordinary + action.
  let created =
    tabs.length === 1 && tabs[0]?.name === 'Frequency 1' && !outputAnalysisId(tabs[0])
      ? tabs[0]
      : undefined;
  if (!created) {
    await tablist().$('button[aria-label="New tab"]').click();
    await browser.waitUntil(async () => {
      created = (await api.listTabs(base, undefined, 'frequency')).find((tab) => !existing.has(tab.id));
      return Boolean(created);
    });
  }
  if (!created) throw new Error('New Frequency analysis was not saved');
  const tab = await api.updateTab(base, created.id, { name });
  await selectTab(base, tab.id);
  return tab;
}

async function addInput(base: string, name: string, chooseTokenizer = true) {
  const add = workspace().$('button=Add data block');
  await add.waitForEnabled();
  await add.click();
  const item = $('[role="dialog"]').$(`button=${name}`);
  await item.waitForDisplayed();
  await item.click();
  await $('[role="dialog"]').waitForExist({ reverse: true });
  const tokenizer = $(`[aria-label=${JSON.stringify(`${name} tokenizer`)}]`);
  await tokenizer.waitForEnabled();
  if (chooseTokenizer) {
    const plain = (await api.getTokenizers(base)).find(
      (model) => model.model_id === 'native:plain_words_en',
    );
    if (!plain) throw new Error('Native word tokenizer is unavailable');
    await tokenizer.click();
    // Radix opens on keyboard as well as pointerdown; this works in the embedded driver.
    await browser.keys('ArrowDown');
    await $(`[role="option"]=${plain.label}`).click();
    await expect(tokenizer).toHaveText(plain.label);
  }
}

async function run(base: string, tab: api.Tab, action = 'Run') {
  const before = outputAnalysisId((await api.listTabs(base, undefined, 'frequency')).find(
    (entry) => entry.id === tab.id,
  ));
  const button = workspace().$(`button=${action}`);
  await expect(button).toHaveAttribute('aria-disabled', 'false');
  await button.click();
  let id: string | null | undefined;
  await browser.waitUntil(
    async () => {
      id = outputAnalysisId((await api.listTabs(base, undefined, 'frequency')).find(
        (entry) => entry.id === tab.id,
      ));
      return Boolean(id && id !== before);
    },
    { timeout: 30_000, timeoutMsg: 'Frequency did not publish a new saved result' },
  );
  if (!id) throw new Error('Frequency result ID is missing');
  await showLoadedResults();
  await browser.waitUntil(async () =>
    (await api.getTasks(base)).tasks.some(
      (task) => task.tab_id === tab.id && task.state === 'succeeded',
    ),
  );
  await expect(workspace().$('button=Run')).toHaveAttribute('aria-disabled', 'true');
  const saved = await api.getFrequencyResult(base, id);
  if (!saved) throw new Error('Completed Frequency analysis has no saved output');
  return saved;
}

async function fixture(base: string, prefix: string) {
  const names = {
    reference: `${prefix}_reference`,
    study: `${prefix}_study`,
    backing: `${prefix}_source`,
  };
  await api.executeSql(
    base,
    [
      {
        sql: `CREATE TABLE ${api.objectSql(names.backing)} AS SELECT * FROM (VALUES ('Apple apple banana.'), ('Banana carrot'), (NULL), ('')) t(text)`,
      },
      {
        sql: `CREATE VIEW ${api.objectSql(names.reference)} AS SELECT text FROM ${api.objectSql(names.backing)}`,
      },
      {
        sql: `CREATE TABLE ${api.objectSql(names.study)} AS SELECT * FROM (VALUES ('banana carrot carrot'), ('durian apple')) t(text)`,
      },
      {
        sql: 'INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?), (?,?)',
        parameters: [names.reference, 'text', names.study, 'text'],
      },
    ],
    { all: true },
  );
  await browser.refresh();
  await openFrequency();
  return names;
}

async function cleanup(base: string, prefix: string) {
  await setAnalysisPaneSize('normal');
  await $('button=Data Loader').click();
  await $('h1=Data Loader').waitForDisplayed();
  const owned = (await api.listTabs(base, undefined, 'frequency')).filter((tab) => tab.name.startsWith(prefix));
  for (const tab of owned) await api.deleteTab(base, tab.id);
  await browser.waitUntil(async () =>
    (await api.getTasks(base)).tasks.every(
      (task) => !owned.some((tab) => tab.id === task.tab_id) || task.finished_at !== null,
    ),
  );
  await api.executeSql(
    base,
    [
      {
        sql: 'DELETE FROM wordflow.nodes WHERE table_name IN (?,?)',
        parameters: [`${prefix}_reference`, `${prefix}_study`],
      },
      { sql: `DROP VIEW IF EXISTS ${api.objectSql(`${prefix}_reference`)}` },
      { sql: `DROP TABLE IF EXISTS ${api.objectSql(`${prefix}_source`)}` },
      { sql: `DROP TABLE IF EXISTS ${api.objectSql(`${prefix}_study`)}` },
    ],
    { all: true },
  );
}

/** Shared browser/native UI scenario; native dialogs remain a separate OS check. */
export async function frequencyInitialTabScenario(base: string) {
  const taskIds = (await api.getTasks(base)).tasks.map((task) => task.id);
  expect(await api.listTabs(base, undefined, 'frequency')).toHaveLength(0);
  const tools = $('[data-sidebar-section="tools"]');
  await expect(tools.$('button=Tools')).toBeDisplayed();
  await expect(tools.$('button[aria-label="Edit visible tools"]')).toBeDisplayed();
  await openFrequency();
  const [initial] = await api.listTabs(base, undefined, 'frequency');
  expect(initial?.name).toBe('Frequency 1');
  const location = $('nav[aria-label="Current location"]');
  await expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Frequency 1');
  expect(outputAnalysisId(initial)).toBeNull();
  await expect($('h1=Token Frequency Analysis')).toBeDisplayed();
  await expect(workspace().$('button=Run')).toHaveAttribute('aria-disabled', 'true');
  await $('button=Data Loader').click();
  await expect(location).toHaveAttribute('title', 'Untitled ▸ Data Loader');
  await openFrequency();
  expect((await api.listTabs(base, undefined, 'frequency')).map((tab) => tab.id)).toEqual([initial?.id]);
  await browser.refresh();
  await openFrequency();
  expect((await api.listTabs(base, undefined, 'frequency')).map((tab) => tab.id)).toEqual([initial?.id]);
  await tablist().$('button[aria-label="New tab"]').click();
  await browser.waitUntil(async () => (await api.listTabs(base, undefined, 'frequency')).length === 2);
  await expect(tablist().$$('[role="tab"]')).toBeElementsArrayOfSize(2);
  expect((await api.listTabs(base, undefined, 'frequency')).map((tab) => tab.name)).toEqual([
    'Frequency 1',
    'Frequency 2',
  ]);
  await expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Frequency 2');
  if (!initial) throw new Error('Initial Frequency tab is missing');
  await selectTab(base, initial.id);
  await expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Frequency 1');
  // The embedded driver emits mouse events, not the tab strip's pointer events.
  // Verify persisted names through the same API/reopen path as createTab above.
  await api.updateTab(base, initial.id, { name: 'Corpus comparison' });
  await browser.refresh();
  await openFrequency();
  await expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency ▸ Corpus comparison');
  await browser.saveScreenshot(
    `.tmp/wdio/frequency-location-${browser.capabilities.browserName ?? 'native'}.png`,
  );
  // Closing the final tab keeps the empty state until another explicit visit.
  await tablist().$('button[aria-label="Close tab"]').click();
  await expect(tablist().$$('[role="tab"]')).toBeElementsArrayOfSize(1);
  const [last] = await api.listTabs(base, undefined, 'frequency');
  await tablist().$('button[aria-label="Close tab"]').click();
  await expect(workspace().$('button=New Frequency analysis')).toBeDisplayed();
  expect(await api.listTabs(base, undefined, 'frequency')).toHaveLength(0);
  await expect(location).toHaveAttribute('title', 'Untitled ▸ Frequency');
  await $('button=Data Loader').click();
  await openFrequency();
  await browser.waitUntil(async () => {
    const tabs = await api.listTabs(base, undefined, 'frequency');
    return tabs.length === 1 && tabs[0]?.id !== last?.id;
  });
  await expect(workspace().$('button=Run')).toHaveAttribute('aria-disabled', 'true');
  expect((await api.getTasks(base)).tasks.map((task) => task.id)).toEqual(taskIds);
}

export async function frequencyConcordanceScenario(base: string, prefix: string) {
  const names = await fixture(base, prefix);
  const before = new Set(
    (await api.listTabs(base, undefined, 'concordance')).map((tab) => tab.id),
  );
  let created: api.Tab | undefined;
  try {
    const tab = await createTab(base, `${prefix} handoff`);
    await addInput(base, names.reference);
    await addInput(base, names.study);
    const saved = await run(base, tab);
    await results().$('button=Ranked lists').click();
    const token = results()
      .$(`[aria-label=${JSON.stringify(`${names.study} ranked frequencies`)}]`)
      .$('[role="listitem"][title^="apple:"]');
    await token.waitForDisplayed();
    await token.click();
    const concordance = $('[data-testid="concordance-workspace"]');
    await concordance.waitForDisplayed();
    await expect(concordance.$('input[aria-label="Concordance query"]')).toHaveValue('apple');
    const previews = concordance.$('[aria-label="Concordance results"]').$$('section');
    await expect(previews).toBeElementsArrayOfSize(2);
    const referencePreview = previews[0];
    const studyPreview = previews[1];
    if (!referencePreview || !studyPreview)
      throw new Error('Both Concordance previews are required');
    await expect(referencePreview.$('h3')).toHaveText(names.reference);
    await expect(studyPreview.$('h3')).toHaveText(names.study);
    await expect(referencePreview).toHaveText(expect.stringContaining('2 matches'));
    await expect(studyPreview).toHaveText(expect.stringContaining('1 matches'));
    const tabs = await api.listTabs(base, undefined, 'concordance');
    created = tabs.find((item) => !before.has(item.id));
    expect(tabs.filter((item) => !before.has(item.id))).toHaveLength(1);
    expect(outputAnalysisId(created)).toBeNull();
    expect(created?.settings.preview).toBeUndefined();
    expect(created?.analysis).toBeNull();
    const concordanceResults = concordance.$('[aria-label="Concordance results"]');
    const layout = concordanceResults.$('[role="tablist"][aria-label="Concordance source layout"]');
    await expect(layout.$('[role="tab"]=Separated')).toHaveAttribute('aria-selected', 'true');
    await layout.$('[role="tab"]=Combined').click();
    await expect(layout.$('[role="tab"]=Combined')).toHaveAttribute('aria-selected', 'true');
    await expect(concordanceResults.$$('section')).toBeElementsArrayOfSize(1);
    await expect(concordanceResults.$('section')).toHaveText(expect.stringContaining('3 matches'));
    expect(await layout.execute((element) => {
      const row = element.parentElement?.parentElement;
      return Boolean(row && Math.abs(row.getBoundingClientRect().right - element.getBoundingClientRect().right) < 2);
    })).toBe(true);
    await browser.saveScreenshot(`.tmp/wdio/${prefix}-combined.png`);
    await browser.keys(Key.ArrowLeft);
    await expect(layout.$('[role="tab"]=Separated')).toHaveAttribute('aria-selected', 'true');
    await expect(previews).toBeElementsArrayOfSize(2);
    expect((await api.listTabs(base, undefined, 'concordance')).find((item) => item.id === created?.id)?.settings).toEqual(created?.settings);
    await browser.refresh();
    await $('button=Concordance').waitForEnabled();
    await $('button=Concordance').click();
    await expect(concordance.$('input[aria-label="Concordance query"]')).toHaveValue('');
    await expect(concordanceResults).not.toExist();
    expect(
      outputAnalysisId((await api.listTabs(base, undefined, 'frequency')).find((item) => item.id === tab.id)),
    ).toBe(saved.id);
    await expect($('[data-sonner-toast]')).not.toExist();
  } finally {
    await $('button=Data Loader').click();
    if (created) await api.deleteTab(base, created.id);
    await cleanup(base, prefix);
  }
}

export async function frequencyRecoveryScenario(base: string, prefix: string) {
  const names = await fixture(base, prefix);
  try {
    const tab = await createTab(base, `${prefix} recovery`);
    await addInput(base, names.reference);
    const saved = await run(base, tab);
    await $('button=Data Loader').click();
    await api.executeSql(base, [{
      sql: 'UPDATE wordflow.analyses SET result_version=999 WHERE id=?',
      parameters: [saved.id],
    }], { all: true });
    expectAppError(/Frequency result version is not supported/);
    await openFrequency();
    await expect(workspace().$('button=Rerun')).toHaveAttribute('aria-disabled', 'false');
    // Restoring readability and retrying must neither clear output nor submit a task.
    await api.executeSql(base, [{
      sql: 'UPDATE wordflow.analyses SET result_version=? WHERE id=?',
      parameters: [saved.result.version, saved.id],
    }], { resources: [] });
    await workspace().$('button=Retry').click();
    await showLoadedResults();
    await expect(workspace().$('button=Run')).toHaveAttribute('aria-disabled', 'true');
    expect((await api.getTasks(base)).tasks.filter((task) => task.tab_id === tab.id)).toHaveLength(1);

    await $('button=Data Loader').click();
    const artifact = saved.result.payload.corpora[0]?.artifact_id;
    if (!artifact) throw new Error('Missing Frequency artifact');
    await api.executeSql(base, [{
      sql: `DROP TABLE ${api.objectSql({ schema: 'wordflow', name: `result_${artifact.replaceAll('-', '')}` })}`,
    }], { all: true });
    await openFrequency();
    await expect(workspace().$('button=Rerun')).toHaveAttribute('aria-disabled', 'false');
    await expect(results()).toHaveText(expect.stringContaining('The display could not be updated.'));
    await browser.saveScreenshot(`.tmp/wdio/${prefix}-rerun.png`);
    const rebuilt = await run(base, tab, 'Rerun');
    expect(rebuilt.id).not.toBe(saved.id);
    expect(rebuilt.request).toEqual(saved.request);
    expect((await api.queryFrequency(base, rebuilt.id, { view: 'corpus' })).totalRows).toBe(3);
    const leftovers = await api.querySql(base, [{
      sql: 'SELECT count(*) AS count FROM wordflow.artifacts WHERE analysis_id=?',
      parameters: [saved.id],
    }]);
    expect(String(leftovers.getChild('count')?.get(0))).toBe('0');
    expect((await api.getTasks(base)).tasks.filter((task) => task.tab_id === tab.id)).toHaveLength(2);
  } finally {
    await cleanup(base, prefix);
  }
}

export async function frequencyPersistenceScenario(base: string, prefix: string) {
  const names = await fixture(base, prefix);
  try {
    const graphBefore = (await api.graph(base)).nodes.map((node) => node.table_name).sort();
    const tab = await createTab(base, `${prefix} saved result`);
    await addInput(base, names.reference);
    const result = await run(base, tab);
    const { table, totalRows } = await api.queryFrequency(base, result.id, { view: 'corpus' });
    expect(totalRows).toBe(3);
    expect(
      table
        .toArray()
        .map((row: Record<string, unknown>) => [String(row.token), String(row.frequency)]),
    ).toEqual([
      ['apple', '2'],
      ['banana', '2'],
      ['carrot', '1'],
    ]);
    await results().$('button=Ranked lists').click();
    const list = results().$(
      `[aria-label=${JSON.stringify(`${names.reference} ranked frequencies`)}]`,
    );
    await expect(list).toHaveText(expect.stringContaining('apple'));
    await expect(list).toHaveText(expect.stringContaining('banana'));
    const filter = results().$('[aria-label="Filter tokens"]');
    await filter.setValue('a*');
    await expect(list).not.toHaveText(expect.stringContaining('banana'));
    await expect(list).toHaveText(expect.stringContaining('apple'));
    await filter.click();
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'a']);
    await browser.keys(Key.Backspace);
    await expect(filter).toHaveValue('');
    await expect(list).toHaveText(expect.stringContaining('banana'));
    expect((await api.graph(base)).nodes.map((node) => node.table_name).sort()).toEqual(
      graphBefore,
    );
    expect(
      (await api.dependencyGraph(base)).nodes.every((node) => node.object.schema !== 'wordflow'),
    ).toBe(true);
    await expect($('[data-testid="project-data-overlay"]')).not.toExist();
    const frequencyTasks = (await api.getTasks(base)).tasks.filter(
      (task) => task.tab_id === tab.id,
    );
    expect(frequencyTasks).toHaveLength(1);
    expect(frequencyTasks[0]?.state).toBe('succeeded');

    // Limits constrain display, not complete exports.
    const exported = await (
      await api.downloadFrequency(base, result.id, { view: 'corpus', limit: 1 }, 'csv')
    ).text();
    expect(exported.trim().split(/\r?\n/)).toEqual([
      '"token","frequency"',
      '"apple","2"',
      '"banana","2"',
      '"carrot","1"',
    ]);

    await filter.setValue('a*');
    await $('button=Data Loader').click();
    await openFrequency();
    await expect(filter).toHaveValue('a*');
    expect(
      (await api.listTabs(base, undefined, 'frequency')).find((entry) => entry.id === tab.id)?.settings,
    ).not.toHaveProperty('filter');
    await browser.refresh();
    await openFrequency();
    await selectTab(base, tab.id);
    await showLoadedResults();
    await expect(results().$('[aria-label="Filter tokens"]')).toHaveValue('');
    await results().$('button=Ranked lists').click();
    await expect(
      results().$(`[aria-label=${JSON.stringify(`${names.reference} ranked frequencies`)}]`),
    ).toHaveText(expect.stringContaining('apple'));
    expect(
      outputAnalysisId((await api.listTabs(base, undefined, 'frequency')).find((entry) => entry.id === tab.id)),
    ).toBe(result.id);
    expect(
      (await api.getTasks(base)).tasks.filter((task) => task.tab_id === tab.id),
    ).toHaveLength(1);

    // A valid stored View can become unavailable; its prior analysis stays self-contained.
    expectAppError(new RegExp(names.backing));
    await api.executeSql(base, [{ sql: `DROP TABLE ${api.objectSql(names.backing)}` }], {
      all: true,
    });
    await expect(workspace().$('button=Run')).toHaveAttribute('aria-disabled', 'true');
    await workspace().$('button=Clear results').click();
    await expect(workspace().$('button=Run')).toHaveAttribute('aria-disabled', 'false');
    await workspace().$('button=Run').click();
    await browser.waitUntil(async () =>
      (await api.getTasks(base)).tasks.some(
        (task) => task.tab_id === tab.id && task.state === 'failed',
      ),
    );
    await browser.waitUntil(async () => (await $$('[data-sonner-toast]').length) > 0);
    expect(await $$('[data-sonner-toast]').map((toast) => toast.getText())).toHaveLength(1);
    await expect(workspace().$('button=Run')).toBeEnabled();
    await expect(results()).not.toExist();
    const failedTab = (await api.listTabs(base, undefined, 'frequency')).find((entry) => entry.id === tab.id);
    expect(outputAnalysisId(failedTab)).toBeNull();
    expect(failedTab?.analysis?.request).toEqual(result.request);
  } finally {
    await cleanup(base, prefix);
  }
}

export async function frequencyComparisonScenario(base: string, prefix: string) {
  const names = await fixture(base, prefix);
  try {
    // Juxtorpus deliberately excludes tokens with ten or fewer combined occurrences.
    await api.executeSql(
      base,
      [
        { sql: `UPDATE ${api.objectSql(names.backing)} SET text=repeat(text || ' ',12)` },
        { sql: `UPDATE ${api.objectSql(names.study)} SET text=repeat(text || ' ',12)` },
      ],
      { all: true },
    );
    const first = await createTab(base, `${prefix} comparison`);
    await addInput(base, names.reference);
    await addInput(base, names.study);
    await expect($(`[aria-label=${JSON.stringify(`${names.reference} corpus role`)}]`)).toHaveText(
      'Reference corpus',
    );
    await expect($(`[aria-label=${JSON.stringify(`${names.study} corpus role`)}]`)).toHaveText(
      'Study corpus',
    );
    const comparison = await run(base, first);
    expect(comparison.result.version).toBe(1);
    const artifacts = await api.querySql(base, [
      {
        sql: `SELECT a.name,t.table_type FROM wordflow.artifacts a
            JOIN information_schema.tables t ON t.table_schema='wordflow'
              AND t.table_catalog=current_database() AND t.table_name=a.relation_name
            WHERE a.analysis_id=? ORDER BY a.name`,
        parameters: [comparison.id],
      },
    ]);
    expect(
      artifacts.toArray().map((row: Record<string, unknown>) => [row.name, row.table_type]),
    ).toEqual([
      ['comparison', 'VIEW'],
      ['corpus-0', 'BASE TABLE'],
      ['corpus-1', 'BASE TABLE'],
    ]);
    await results().$('button=Ranked lists').click();
    const page = await api.queryFrequency(base, comparison.id, {
      view: 'comparison',
      sort: 'token',
      descending: false,
    });
    expect(
      page.table
        .toArray()
        .map((row: Record<string, unknown>) => [
          String(row.token),
          String(row.freq_corpus_0),
          String(row.freq_corpus_1),
        ]),
    ).toEqual([
      ['apple', '24', '12'],
      ['banana', '24', '12'],
      ['carrot', '12', '24'],
      ['durian', '0', '12'],
    ]);
    await showFrequencyContent('[aria-label="Keyness statistics"]');
    await expect(results().$('[aria-label="Frequency comparison"]')).toBeDisplayed();
    await expect(results().$('button[aria-label="Sort by Overuse"]')).toExist();
    await expect(results().$('button[aria-label="Sort by Signed LL"]')).toExist();
    for (const label of ['Overuse', 'Signed LL']) {
      await results().$(`button[aria-label="Sort by ${label}"]`).click();
      await expect(results().$('[aria-label="Frequency comparison"]')).toHaveText(
        expect.stringContaining('apple'),
      );
      await expect(results().$('[aria-label="Frequency comparison"]')).not.toHaveText(
        expect.stringContaining('No matching'),
      );
    }
    const csv = await (
      await api.downloadFrequency(base, comparison.id, { view: 'comparison' }, 'csv')
    ).text();
    expect(csv).toContain(`Reference count (${names.reference})`);
    expect(csv).toContain(`Study count (${names.study})`);
    expect(csv).toContain('signed_ll');
    expect(csv).toContain('overuse');
    const second = await createTab(base, `${prefix} independent`);
    await addInput(base, names.study);
    const independent = await run(base, second);
    expect(independent.result.payload.corpora).toHaveLength(1);
    await selectTab(base, first.id);
    await showFrequencyContent('[aria-label="Keyness statistics"]');
    await expect(results().$('[aria-label="Frequency comparison"]')).toBeDisplayed();
    await selectTab(base, second.id);
    await expect(results().$('[aria-label="Frequency comparison"]')).not.toExist();
    const current = await api.listTabs(base, undefined, 'frequency');
    expect(outputAnalysisId(current.find((tab) => tab.id === first.id))).toBe(comparison.id);
    expect(outputAnalysisId(current.find((tab) => tab.id === second.id))).toBe(independent.id);
    await selectTab(base, first.id);
    for (const theme of ['light', 'dark']) {
      await $('button[aria-label="Open settings"]').click();
      const dark = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
      if (((await dark.getAttribute('aria-checked')) === 'true') !== (theme === 'dark'))
        await dark.click();
      await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
      await expect($('html')).toHaveAttribute('data-theme', `${theme}-2026`);
      await setAnalysisPaneSize('normal');
      await results().$('button=Word clouds').click();
      const juxtorpus = results().$('[aria-label="Juxtorpus"]');
      await showFrequencyContent('[aria-label="Frequency results"] [role="img"]');
      await waitForCloudWords('[aria-label="Frequency results"] [role="img"]');
      await browser.saveScreenshot(`.tmp/wdio/${prefix}-clouds-${theme}.png`);
      await showFrequencyContent('[aria-label="Juxtorpus"]');
      await expect(juxtorpus.$('svg')).toBeDisplayed();
      await expect(juxtorpus.$('[aria-label="Reference to Study color scale"]')).toBeDisplayed();
      await expect(juxtorpus.$('[style*="linear-gradient"]')).toExist();
      await waitForCloudWords('[aria-label="Juxtorpus"] [role="img"]');
      await browser.saveScreenshot(`.tmp/wdio/${prefix}-juxtorpus-${theme}.png`);
      await setAnalysisPaneSize('narrow');
      await browser.waitUntil(async () =>
        workspace().execute((element) => element.clientWidth < 400),
      );
      await assertNoHorizontalOverflow();
      await showFrequencyContent('[aria-label="Juxtorpus"]');
      await waitForCloudWords('[aria-label="Juxtorpus"] [role="img"]');
      await browser.saveScreenshot(`.tmp/wdio/${prefix}-juxtorpus-narrow-${theme}.png`);
      await results().$('button=Ranked lists').click();
      const statistics = results().$('[aria-label="Frequency comparison"]');
      await showFrequencyContent('[aria-label="Keyness statistics"]');
      await expect(statistics).toHaveText(expect.stringContaining('durian'));
      await assertNoHorizontalOverflow();
      await browser.saveScreenshot(`.tmp/wdio/${prefix}-comparison-narrow-${theme}.png`);
    }
  } finally {
    await cleanup(base, prefix);
  }
}

export async function frequencyLocalLanguageScenario(base: string, prefix: string) {
  const names = await fixture(base, prefix);
  try {
    await api.executeSql(
      base,
      [
        { sql: `DELETE FROM ${api.objectSql(names.backing)}` },
        {
          sql: `INSERT INTO ${api.objectSql(names.backing)} VALUES ('This document is written in English. The birds are singing in the garden and the children are playing together.')`,
        },
      ],
      { all: true },
    );
    const tab = await createTab(base, `${prefix} language`);
    const before = (await api.getTasks(base)).tasks.length;
    // WKWebView custom-protocol fetches are not all present in Resource Timing.
    // Observe the real requests without changing responses or suppressing network work.
    await browser.execute(() => {
      // Vite module requests can fill the default 250-entry buffer before model loading.
      performance.clearResourceTimings();
      performance.setResourceTimingBufferSize(2000);
      const original = window.fetch.bind(window);
      const urls: string[] = [];
      window.__frequencyNetworkProbe = {
        urls,
        restore: () => {
          window.fetch = original;
        },
      };
      window.fetch = (input: RequestInfo | URL, options?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? new URL(input, document.baseURI).href
            : input instanceof URL
              ? input.href
              : input.url;
        if (/(?:text_wasm_|language-detector\.tflite)/.test(url)) urls.push(url);
        return original.call(window, input, options);
      };
    });
    await addInput(base, names.reference, false);
    const plain = (await api.getTokenizers(base)).find(
      (model) => model.model_id === 'native:plain_words_en',
    );
    if (!plain) throw new Error('Native word tokenizer is unavailable');
    await expect($(`[aria-label=${JSON.stringify(`${names.reference} tokenizer`)}]`)).toHaveText(
      plain.label,
    );
    const observed = await browser.execute((backendBase) => {
      const application = new URL(backendBase);
      const fetches = window.__frequencyNetworkProbe?.urls ?? [];
      const resources = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /(?:text_wasm_|language-detector\.tflite)/.test(name));
      // Compare within the WebView: Node and WebKit serialize custom-scheme origins differently.
      const external = [...fetches, ...resources].filter((name) => {
        const url = new URL(name, document.baseURI);
        return url.protocol !== application.protocol || url.host !== application.host;
      });
      return { fetches, resources, external };
    }, base);
    expect(observed.fetches.some((name) => name.endsWith('/api/resources/language/language-detector.tflite'))).toBe(
      true,
    );
    expect(observed.external).toEqual([]);
    if (browser.capabilities.browserName === 'chrome')
      expect(observed.resources.some((name) => name.endsWith('language-detector.tflite'))).toBe(
        true,
      );
    expect((await api.getTasks(base)).tasks).toHaveLength(before);
    expect(
      outputAnalysisId((await api.listTabs(base, undefined, 'frequency')).find((entry) => entry.id === tab.id)),
    ).toBeNull();
  } finally {
    await browser.execute(() => {
      window.__frequencyNetworkProbe?.restore();
      delete window.__frequencyNetworkProbe;
    });
    await cleanup(base, prefix);
  }
}

export async function frequencyContinuousListScenario(base: string, prefix: string) {
  const names = await fixture(base, prefix);
  try {
    await api.executeSql(
      base,
      [
        { sql: `DELETE FROM ${api.objectSql(names.backing)}` },
        {
          sql: `INSERT INTO ${api.objectSql(names.backing)} SELECT repeat('word' || chr((97 + i // 26)::INTEGER) || chr((97 + i % 26)::INTEGER) || ' ', 600 - i) FROM range(600) t(i)`,
        },
        { sql: `DELETE FROM ${api.objectSql(names.study)}` },
        {
          sql: `INSERT INTO ${api.objectSql(names.study)} SELECT text FROM ${api.objectSql(names.backing)} LIMIT 500`,
        },
      ],
      { all: true },
    );
    const tab = await createTab(base, `${prefix} scrolling`);
    await addInput(base, names.reference);
    await addInput(base, names.study);
    const saved = await run(base, tab);
    await results().$('button=Ranked lists').click();
    const first = results().$(
      `[aria-label=${JSON.stringify(`${names.reference} ranked frequencies`)}]`,
    );
    const second = results().$(
      `[aria-label=${JSON.stringify(`${names.study} ranked frequencies`)}]`,
    );
    await expect(first).toHaveText(expect.stringContaining('wordaa'));
    await expect(first.$('a[aria-label="Go to next page"]')).not.toExist();
    for (const theme of ['light', 'dark']) {
      await $('button[aria-label="Open settings"]').click();
      const dark = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
      if (((await dark.getAttribute('aria-checked')) === 'true') !== (theme === 'dark'))
        await dark.click();
      await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
      await first.execute((element) => {
        element.scrollTop = 400 * 40;
        element.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await expect(first).toHaveText(expect.stringContaining('wordpk'));
      await expect(second).toHaveText(expect.stringContaining('wordpk'));
      const item = first.$('[aria-posinset="401"]');
      await expect(item).toHaveAttribute('aria-setsize', '600');
      const width = await item.$('[aria-hidden="true"]').getAttribute('style');
      expect(width).toMatch(/width: 33\.333/);
      expect(await first.$$('[role="listitem"]').length).toBeLessThan(40);
      await showFrequencyContent(
        `[aria-label=${JSON.stringify(`${names.reference} ranked frequencies`)}]`,
      );
      await browser.waitUntil(
        () =>
          first.execute(
            (element) => getComputedStyle(element).color === getComputedStyle(document.body).color,
          ),
        { timeoutMsg: 'Ranked list foreground did not finish changing with the theme' },
      );
      await browser.saveScreenshot(`.tmp/wdio/${prefix}-continuous-${theme}.png`);
    }
    await showFrequencyContent('[aria-label="Keyness statistics"]');
    const statistics = results().$('[aria-label="Keyness statistics"]');
    await statistics.$('button[aria-label="Sort by Token"]').click();
    await statistics.$('button[aria-label="Sort by Token"]').click();
    await expect(statistics.$('[aria-label="Frequency comparison"]')).toHaveText(
      expect.stringContaining('wordaa'),
    );
    await statistics.$('a[aria-label="Go to next page"]').click();
    await expect(statistics.$('[aria-label="Frequency comparison"]')).toHaveText(
      expect.stringContaining('wordby'),
    );
    await showFrequencyContent('[aria-label="Filter tokens"]');
    await results().$('[aria-label="Filter tokens"]').setValue('wordaa');
    await expect(first).toHaveText(expect.stringContaining('wordaa'));
    await expect(first.$('[role="listitem"]')).toHaveAttribute('aria-setsize', '1');
    expect(await first.execute((element) => element.scrollTop)).toBe(0);
    await expect(statistics.$('a[aria-current="page"]')).toHaveText('1');
    await expect(statistics.$('[aria-label="Frequency comparison"]')).toHaveText(
      expect.stringContaining('wordaa'),
    );
    const csv = await (
      await api.downloadFrequency(base, saved.id, { view: 'corpus', corpus_index: 0 }, 'csv')
    ).text();
    expect(csv.trim().split(/\r?\n/)).toHaveLength(601);
    expect(
      (await api.getTasks(base)).tasks.filter((task) => task.tab_id === tab.id),
    ).toHaveLength(1);
  } finally {
    await cleanup(base, prefix);
  }
}

export async function frequencyStopwordsScenario(base: string, prefix: string) {
  const { readStopwords, saveStopwords, writableStopwords } = await import(
    '../../src/features/tools/common/stopwords/stopwordData'
  );
  const names = await fixture(base, prefix);
  const source = (name: string, column = 'word') => ({
    source: { schema: 'data', name },
    column,
  });
  const multi = source(`${prefix}_shared "words"`);
  const numeric = source(`${prefix}_numbers`, 'code');
  const view = source(`${prefix}_view`, 'code');
  const captureState = async (state: string) => {
    // Capture the settled design, not the WebView's first frame of a theme/modal transition.
    await browser.execute(() => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming().iterations !== Infinity) animation.finish();
      }
    });
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const label = document.querySelector('[aria-label="Stopwords"] label');
          return !!label && getComputedStyle(label).color === getComputedStyle(document.body).color;
        }),
      { timeoutMsg: 'Stopword foreground did not finish changing with the theme' },
    );
    await browser.saveScreenshot(`.tmp/wdio/${prefix}-stopwords-${state}.png`);
  };

  try {
    await api.executeSql(
      base,
      [
        {
          sql: `CREATE TABLE ${api.objectSql(multi.source)} (word VARCHAR, note VARCHAR DEFAULT 'new')`,
        },
        {
          sql: `INSERT INTO ${api.objectSql(multi.source)} VALUES ('banana','remove'),(' Apple ','keep'),('APPLE','also keep'),(NULL,'null'),(' ','blank')`,
        },
        { sql: `CREATE TABLE ${api.objectSql(numeric.source)} (code INTEGER NOT NULL)` },
        { sql: `INSERT INTO ${api.objectSql(numeric.source)} VALUES (123),(456)` },
        {
          sql: `CREATE VIEW ${api.objectSql(view.source)} AS SELECT code FROM ${api.objectSql(numeric.source)} ORDER BY code DESC`,
        },
        {
          sql: 'INSERT INTO wordflow.nodes(table_name) VALUES (?),(?),(?)',
          parameters: [multi.source.name, numeric.source.name, view.source.name],
        },
      ],
      { all: true },
    );
    expect(await readStopwords(base, multi)).toEqual(['banana', 'apple']);
    await saveStopwords(base, multi, ['apple', 'banana'], ['APPLE', 'carrot']);
    expect(await readStopwords(base, multi)).toEqual(['apple', 'carrot']);
    const preserved = await api.querySql(base, [
      { sql: `SELECT word,note FROM ${api.objectSql(multi.source)} ORDER BY note` },
    ]);
    expect(preserved.toArray().map((row: Record<string, unknown>) => [row.word, row.note])).toEqual(
      [
        ['APPLE', 'also keep'],
        [' ', 'blank'],
        [' Apple ', 'keep'],
        ['carrot', 'new'],
        [null, 'null'],
        [null, 'remove'],
      ],
    );
    await expect(
      saveStopwords(base, numeric, ['123', '456'], ['456', 'not a number']),
    ).rejects.toThrow();
    expect(await readStopwords(base, numeric)).toEqual(['123', '456']);
    await api.executeSql(
      base,
      [
        {
          sql: `ALTER TABLE ${api.objectSql(numeric.source)} ADD COLUMN note VARCHAR DEFAULT 'keep'`,
        },
      ],
      { all: true },
    );
    await expect(saveStopwords(base, numeric, ['123', '456'], ['456'])).rejects.toThrow();
    expect(await readStopwords(base, numeric)).toEqual(['123', '456']);

    const copied = await writableStopwords(base, view, [source(names.reference, 'text')]);
    expect((await api.nodeSchema(base, copied.source))[0]?.name).toBe('code');
    await saveStopwords(base, copied, ['123', '456'], ['456', '789']);
    expect(await readStopwords(base, view)).toEqual(['456', '123']);
    expect(await readStopwords(base, copied)).toEqual(['456', '789']);
    const edges = await api.graph(base);
    expect(
      edges.edges
        .filter((edge) => edge.target_name === copied.source.name)
        .map((edge) => edge.source_name)
        .sort(),
    ).toEqual([names.reference, view.source.name].sort());

    const tab = await createTab(base, `${prefix} reusable list`);
    await addInput(base, names.reference);
    const saved = await run(base, tab);
    await results().$('button=Ranked lists').click();
    const list = () =>
      results().$(`[aria-label=${JSON.stringify(`${names.reference} ranked frequencies`)}]`);
    await expect(list()).toHaveText(expect.stringContaining('apple'));
    await showFrequencyContent('[aria-label="Stopwords"]');
    const control = () => $('[aria-label="Stopwords"]');
    await captureState('empty');
    await control().$('button=Create empty').click();
    await expect(control()).toHaveText(expect.stringContaining('0 words'));
    const selection = async () =>
      (await api.listTabs(base, undefined, 'frequency')).find((t) => t.id === tab.id)?.settings
        .stopwordSource as ReturnType<typeof source>;
    const created = await selection();
    expect(created.source.name).toBe(`${names.reference}_stopwords`);
    expect(await $('[aria-label="Data View"]').isExisting()).toBe(false);

    // Wait for commit delivery, then prove unrelated known writes leave saved projections alone.
    await browser.execute(
      (url, resultId) => {
        const original = window.fetch.bind(window);
        const events = new EventSource(`${url}/api/project/events`);
        const probe = {
          requests: 0,
          events: 0,
          restore: () => {
            window.fetch = original;
            events.close();
          },
        };
        events.addEventListener('change', () => {
          probe.events++;
        });
        window.fetch = (input, init) => {
          const path = input instanceof Request ? input.url : String(input);
          if (path.includes(`/analyses/${resultId}/frequency/query`)) probe.requests++;
          return original(input, init);
        };
        window.__frequencyRefreshProbe = probe;
      },
      base,
      saved.id,
    );
    try {
      const untouched = `${prefix}_unrelated`;
      await api.executeSql(base, [{ sql: `CREATE TABLE ${api.objectSql(untouched)}(n INTEGER)` }], {
        objects: [api.objectRef(untouched)],
        resources: ['graph'],
      });
      await browser.waitUntil(
        async () => (await browser.execute(() => window.__frequencyRefreshProbe?.events ?? 0)) > 0,
      );
      // Allow queued query notifications to settle without relying on native RAF.
      await browser.pause(100);
      await browser.execute(() => {
        if (window.__frequencyRefreshProbe) window.__frequencyRefreshProbe.requests = 0;
      });
      await api.executeSql(base, [{ sql: `INSERT INTO ${api.objectSql(untouched)} VALUES (1)` }], {
        objects: [api.objectRef(untouched)],
      });
      await browser.waitUntil(
        async () => (await browser.execute(() => window.__frequencyRefreshProbe?.events ?? 0)) > 1,
      );
      await browser.pause(100);
      expect(await browser.execute(() => window.__frequencyRefreshProbe?.requests)).toBe(0);
      await saveStopwords(base, created, [], ['apple']);
      await expect(list()).not.toHaveText(expect.stringContaining('apple'));
      expect(await browser.execute(() => window.__frequencyRefreshProbe?.requests)).toBeGreaterThan(
        0,
      );
      await saveStopwords(base, created, ['apple'], []);
      await expect(list()).toHaveText(expect.stringContaining('apple'));
      await api.executeSql(base, [{ sql: `DROP TABLE ${api.objectSql(untouched)}` }], {
        objects: [api.objectRef(untouched)],
        resources: ['graph'],
      });
    } finally {
      await browser.execute(() => {
        window.__frequencyRefreshProbe?.restore();
        delete window.__frequencyRefreshProbe;
      });
    }

    await results().$('button=Word clouds').click();
    const cloudSelector = '[aria-label="Frequency results"] [role="img"]';
    await showFrequencyContent(cloudSelector);
    await waitForCloudWords(cloudSelector);
    await $('button[aria-label="Fit view"]').click();
    const graphNode = $(`.react-flow__node[data-id=${JSON.stringify(created.source.name)}]`);
    await graphNode.waitForDisplayed();
    await graphNode.waitForStable();
    const initialTransform = (await graphNode.getAttribute('style')) ?? '';
    const point = (await graphNode.execute((element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    })) as { x: number; y: number };
    await browser.execute((selector) => {
      const cloud = document.querySelector(selector);
      if (!cloud) throw new Error('Cloud is missing');
      const probe = {
        mutations: 0,
        observer: new MutationObserver((records) => {
          probe.mutations += records.length;
        }),
      };
      probe.observer.observe(cloud, { childList: true, subtree: true });
      window.__frequencyCloudProbe = probe;
    }, cloudSelector);
    try {
      if (await browser.execute(() => '__TAURI_INTERNALS__' in window)) {
        // Embedded-driver MouseEvents omit `view` and held buttons, which d3-drag
        // requires. Deliver complete DOM gestures in the actual native WebView.
        await browser.execute(async ({ x, y }: { x: number; y: number }) => {
          const target = document.elementFromPoint(x, y);
          if (!target) throw new Error('Drag target is missing');
          const event = (type: string, step: number, buttons: number) =>
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons,
              clientX: x + step * 5,
              clientY: y - step * 3,
            });
          target.dispatchEvent(event('mousedown', 0, 1));
          for (let step = 1; step <= 8; step++) {
            window.dispatchEvent(event('mousemove', step, 1));
            await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
          }
          window.dispatchEvent(event('mouseup', 8, 0));
        }, point);
      } else {
        const drag = browser.action('pointer', { id: 'mouse' }).move(point).down();
        for (let step = 1; step <= 8; step++)
          drag.move({ x: point.x + step * 5, y: point.y - step * 3, duration: 60 });
        await drag.up().perform();
      }
      await expect(graphNode).not.toHaveAttribute('style', initialTransform);
      await graphNode.click();
      await browser.pause(100);
      expect(await browser.execute(() => window.__frequencyCloudProbe?.mutations)).toBe(0);
    } finally {
      await browser.execute(() => {
        window.__frequencyCloudProbe?.observer.disconnect();
        delete window.__frequencyCloudProbe;
      });
    }
    await showFrequencyContent('[aria-label="Frequency results"]');
    await results().$('button=Ranked lists').click();
    await showFrequencyContent('[aria-label="Stopwords"]');
    await control().$('button=Edit words…').click();
    const dialog = () => $('[role="dialog"][aria-labelledby]');
    const draft = () => dialog().$('input[aria-label="Add stopword"]');
    await draft().setValue('banana');
    await browser.keys(Key.Enter);
    await expect(dialog().$('button[aria-label="Remove stopword banana"]')).toExist();
    await draft().waitForEnabled();
    await draft().setValue('Apple');
    await browser.keys(Key.Enter);
    await expect(dialog().$('button[aria-label="Remove stopword apple"]')).toExist();
    await draft().waitForEnabled();
    await draft().setValue('apple');
    await browser.keys(Key.Enter);
    await expect(dialog()).toHaveText(expect.stringContaining('2 words'));
    await dialog().$('button=Close').waitForEnabled();
    await dialog().$('button=Close').click();
    await dialog().waitForExist({ reverse: true });
    await expect(list()).not.toHaveText(expect.stringContaining('apple'));
    await expect(list()).toHaveText(expect.stringContaining('carrot'));
    expect(await readStopwords(base, created)).toEqual(['banana', 'apple']);
    await control().$('button=Edit words…').click();
    expect(
      await dialog()
        .$$('button[aria-label^="Remove stopword "]')
        .map((bubble) => bubble.getAttribute('aria-label')),
    ).toEqual(['Remove stopword banana', 'Remove stopword apple']);
    await dialog().$('button=Sort').click();
    await browser.waitUntil(async () => JSON.stringify(await readStopwords(base, created)) === JSON.stringify(['apple', 'banana']));
    await expect(dialog().$$('button[aria-label^="Remove stopword "]')[0]).toHaveAttribute('aria-label', 'Remove stopword apple');
    await dialog().$('button=Close').waitForEnabled();
    await dialog().$('button=Close').click();
    await dialog().waitForExist({ reverse: true });
    // A direct SQL edit triggers the same data refresh as the Table editor and shared analyses.
    await api.runSqlScript(
      base,
      `DELETE FROM ${api.objectSql(created.source)} WHERE word='Apple'`,
      'execute',
      'Edit stopword list',
    );
    await expect(list()).toHaveText(expect.stringContaining('apple'));
    const csv = await (
      await api.downloadFrequency(
        base,
        saved.id,
        { view: 'corpus', stopword_source: created },
        'csv',
      )
    ).text();
    expect(csv).toContain('apple');
    expect(csv).not.toContain('banana');
    expect(
      (await api.getTasks(base)).tasks.filter((task) => task.tab_id === tab.id),
    ).toHaveLength(1);
    expect((await api.getFrequencyResult(base, saved.id))?.result).toEqual(saved.result);

    const other = await api.createTab(base, 'frequency', `${prefix} another analysis`);
    await api.updateTab(base, other.id, {
      settings: { stopwordSource: created, stopwordsEnabled: true },
    });
    await api.runFrequency(base, other.id, decodeAnalysisRequest('frequency', saved.request).request);
    await browser.refresh();
    await openFrequency();
    await selectTab(base, other.id);
    await showLoadedResults();
    await results().$('button=Ranked lists').click();
    await expect(list()).toHaveText(expect.stringContaining('apple'));
    await expect(list()).not.toHaveText(expect.stringContaining('banana'));
    await api.runSqlScript(
      base,
      `INSERT INTO ${api.objectSql(created.source)} VALUES ('apple')`,
      'execute',
      'Update shared list',
    );
    await expect(list()).not.toHaveText(expect.stringContaining('apple'));
    await selectTab(base, tab.id);
    await showLoadedResults();
    await results().$('button=Ranked lists').click();
    await expect(list()).not.toHaveText(expect.stringContaining('apple'));
    await api.runSqlScript(
      base,
      `DELETE FROM ${api.objectSql(created.source)} WHERE word='apple'`,
      'execute',
      'Update shared list',
    );
    await expect(list()).toHaveText(expect.stringContaining('apple'));
    await showFrequencyContent('[aria-label="Stopwords"]');
    await expect(control().$('button=Edit Table…')).not.toExist();
    for (const theme of ['light', 'dark']) {
      await $('button[aria-label="Open settings"]').click();
      const dark = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
      if (((await dark.getAttribute('aria-checked')) === 'true') !== (theme === 'dark'))
        await dark.click();
      await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
      await showFrequencyContent('[aria-label="Stopwords"]');
      await assertNoHorizontalOverflow();
      await captureState(theme);
      await setAnalysisPaneSize('narrow');
      await showFrequencyContent('[aria-label="Stopwords"]');
      await assertNoHorizontalOverflow();
      await captureState(`narrow-${theme}`);
      await control().$('button=Edit words…').click();
      await $('input[aria-label="Add stopword"]').waitForDisplayed();
      await $('input[aria-label="Add stopword"]').setValue('example');
      await browser.keys(Key.Enter);
      await expect($('button[aria-label="Remove stopword example"]')).toExist();
      await captureState(`dialog-${theme}`);
      await $('[role="dialog"]').$('button=Add language preset…').click();
      const presets = $('//div[@role="dialog"][.//h2[text()="Add language preset"]]');
      await expect(presets.$('fieldset label')).toHaveText(expect.stringContaining('Recommended'));
      await expect(presets.$('[role="checkbox"]')).toHaveAttribute('aria-checked', 'true');
      await captureState(`presets-${theme}`);
      await presets.$('button=Add to list').click();
      await presets.waitForExist({ reverse: true });
      await browser.waitUntil(
        async () => (await $$('button[aria-label^="Remove stopword "]').length) > 10,
      );
      await captureState(`preset-bubbles-${theme}`);
      await $('[role="dialog"]').$('button=Close').waitForEnabled();
      await $('[role="dialog"]').$('button=Close').click();
      await setAnalysisPaneSize('normal');
    }
    // Preset confirmation now writes immediately; verify it before resetting this fixture.
    const presetWords = await readStopwords(base, created);
    expect(presetWords.length).toBeGreaterThan(10);
    await api.saveStopwords(base, created, presetWords, ['banana']);
    await expect(control()).toHaveText(expect.stringContaining('1 word'));
    // Editing words copies the View column and leaves the View unchanged.
    await selectTab(base, other.id);
    await showLoadedResults();
    const selectList = async (name: string, column: string) => {
      await showFrequencyContent('[aria-label="Stopwords"]');
      await control().$('button=Clear all').click();
      await control().$('button=Add data block').waitForEnabled();
      await control().$('button=Add data block').click();
      await $('input[placeholder="Search data blocks…"]').setValue(name);
      await $('[role="dialog"]').$(`button=${name}`).click();
      await $('[role="dialog"]').waitForExist({ reverse: true });
      await control().$('[aria-label="Stopword column"]').waitForEnabled();
      await control().$('[aria-label="Stopword column"]').click();
      await $(`[role="option"]=${column}`).click();
      await $('[role="dialog"]').waitForExist({ reverse: true });
    };
    await selectList(view.source.name, 'code');
    await expect(control()).toHaveText(expect.stringContaining('Editing copies this column'));
    await control().$('button=Edit words…').click();
    await $('input[aria-label="Add stopword"]').waitForDisplayed();
    await expect($('button[aria-label="Remove stopword 123"]')).toExist();
    await expect($('button[aria-label="Remove stopword 456"]')).toExist();
    await $('[role="dialog"]').$('button=Close').click();
    await $('[role="dialog"]').waitForExist({ reverse: true });
    const copySelection = (await api.listTabs(base, undefined, 'frequency')).find((t) => t.id === other.id)
      ?.settings.stopwordSource as ReturnType<typeof source>;
    expect(copySelection.source.name).toBe(`${view.source.name}_stopwords_2`);
    expect(await readStopwords(base, view)).toEqual(['456', '123']);
    await selectTab(base, tab.id);
    await showLoadedResults();
    await api.changeColumn(base, created.source, {
      operation: 'rename',
      column: 'word',
      name: 'stop word',
    });
    await api.renameNode(base, created.source, `${prefix}_renamed`);
    await browser.refresh();
    await openFrequency();
    await selectTab(base, tab.id);
    await showLoadedResults();
    await results().$('button=Ranked lists').click();
    await expect(control().$('[aria-label="Stopword column"]')).toHaveText('stop word');
    await expect(control()).toHaveText(expect.stringContaining('1 word'));
    await api.runSqlScript(
      base,
      `DROP TABLE ${api.objectSql(`${prefix}_renamed`)}`,
      'execute',
      'Remove stopword list',
    );
    await expect(results()).toHaveText(expect.stringContaining('display is outdated'));
    await expect(list()).toHaveText(expect.stringContaining('apple'));
    await expect(
      results().$(`button[aria-label=${JSON.stringify(`Export ${names.reference} list`)}]`),
    ).toBeDisabled();
    await showFrequencyContent('[aria-label="Stopwords"]');
    await captureState('unavailable');
    await control().$('button=Clear all').click();
    await expect(list()).toHaveText(expect.stringContaining('banana'));
    expect(outputAnalysisId((await api.listTabs(base, undefined, 'frequency')).find((t) => t.id === tab.id))).toBe(
      saved.id,
    );
  } finally {
    for (const node of (await api.graph(base)).nodes.filter(
      (n) =>
        n.table_name.startsWith(prefix) && ![names.reference, names.study].includes(n.table_name),
    )) {
      await api.deleteNode(base, node.table_name);
    }
    await cleanup(base, prefix);
  }
}
