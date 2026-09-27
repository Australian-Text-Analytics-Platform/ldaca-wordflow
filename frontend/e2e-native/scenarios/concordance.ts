import { outputAnalysisId } from './analysisState';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import { browser, $, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as api from '../../src/features/project/api';
export async function concordanceScenario(base: string, prefix: string) {
  const name = `${prefix}_documents`;
  await api.executeSql(
    base,
    [
      { sql: `CREATE TABLE ${api.identifier(name)} (text VARCHAR, category VARCHAR)` },
      {
        sql: `INSERT INTO ${api.identifier(name)} VALUES ('😀 cat cat dog','one'),('no match','two'),('猫 cat','three')`,
      },
      {
        sql: "INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?, 'text')",
        parameters: [name],
      },
    ],
    { objects: [{ schema: 'data', name }], resources: ['graph'] },
  );
  await browser.refresh();
  // The embedded WebView can be backgrounded during automation. Static visual
  // checks must not leave Radix closing layers waiting for animation frames.
  const disableAnimations = () =>
    browser.execute(() => {
      const style = document.createElement('style');
      style.textContent =
        '*,*::before,*::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }';
      document.head.append(style);
    });
  await disableAnimations();
  await $('button=Concordance').waitForEnabled();
  await $('button=Concordance').click();
  const workspace = $('[data-testid="concordance-workspace"]');
  await workspace.waitForDisplayed();
  await $('[role="tablist"][aria-label="Concordance analyses"]').waitForDisplayed();
  await workspace.$('button=Add data block').click();
  await $('[role="dialog"]').$(`button=${name}`).click();
  await browser.keys(Key.Escape);
  const query = workspace.$('input[aria-label="Concordance query"]');
  await query.setValue('cat');
  const request = workspace.$('[aria-label="Concordance request"]');
  const results = workspace.$('[aria-label="Concordance results"]');
  await expect(request.$('button=Preview')).toHaveAttribute('aria-disabled', 'false');
  await request.$('button=Preview').click();
  await results.$('button=cat').waitForExist();
  await expect(results.$('[role="tab"]=Table')).toHaveAttribute('aria-selected', 'true');
  await expect(results.$('button=Preview')).not.toExist();
  await expect(results.$('button=Saved results')).not.toExist();
  await results.$('button*=Metadata').click();
  const columns = $('[role="dialog"][aria-label="Concordance metadata columns"]');
  await columns.waitForDisplayed();
  await columns.$('label=category').click();
  await browser.saveScreenshot(`.tmp/wdio/${prefix}-concordance-columns.png`);
  await browser.keys(Key.Escape);
  await columns.waitForExist({ reverse: true });
  await expect(results.$('th=category')).toExist();
  const tabs = await api.listTabs(base, undefined, 'concordance');
  const tab = tabs[0];
  if (!tab) throw new Error('Concordance tab missing');
  expect(outputAnalysisId(tab)).toBeNull();
  expect(tab.settings.preview).toBeUndefined();
  expect(tab.analysis).toBeNull();
  await $('button=Data Loader').click();
  await api.executeSql(
    base,
    [{ sql: `UPDATE ${api.identifier(name)} SET text = 'cat fresh' WHERE category = 'two'` }],
    {
      objects: [{ schema: 'data', name }],
    },
  );
  await browser.refresh();
  await $('button=Concordance').waitForEnabled();
  await $('button=Concordance').click();
  await expect(results).not.toExist();
  await disableAnimations();
  await workspace.$('button=Add data block').click();
  await $('[role="dialog"]').$(`button=${name}`).click();
  await browser.keys(Key.Escape);
  await query.setValue('cat');
  await request.$('button=Preview').click();

  await expect(query).toHaveValue('cat');
  await expect(results).toHaveText(expect.stringContaining('4 matches'));
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
  await expect(request.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
  await request.$('button=Run').click();
  let resultId: string | null = null;
  await browser.waitUntil(
    async () => {
      resultId =
        outputAnalysisId((await api.listTabs(base, undefined, 'concordance')).find(
          (item) => item.id === tab.id,
        )) ?? null;
      return Boolean(resultId);
    },
    { timeout: 30000 },
  );
  await expect(request.$('button=Run')).toHaveAttribute('aria-disabled', 'true');
  await results.$('button=Add to Project').waitForExist();
  await results.$('button=Dispersion').scrollIntoView();
  await results.$('button=Dispersion').click();
  await results.$('[aria-roledescription="interactive chart"]').waitForExist();
  await browser.waitUntil(async () =>
    results.$('[aria-roledescription="interactive chart"] svg').isExisting(),
  );
  const plot = results.$('[aria-roledescription="interactive chart"]');
  const proportional = results.$('label*=Bar length proportional to text length');
  await proportional.click();
  await expect(plot).not.toExist();
  await expect(results.$('[aria-label="Matched terms"]')).toBeDisplayed();
  await proportional.click();
  await plot.waitForExist();
  await plot.execute((element) => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await plot.waitForDisplayed();
  // Click an actual data point at the center of bin 4. Each occupied bin has one hit.
  const point = (await plot.execute((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left + 42 + (rect.width - 58) * 0.175),
      y: Math.round(rect.top + 13),
    };
  })) as { x: number; y: number };
  await browser.action('pointer').move({ x: point.x, y: point.y }).down().up().perform();
  await expect(results.$('button=cat (1/4)')).toExist();
  await results.$('button[aria-label="Zoom in"]').click();
  await expect(results.$('button[aria-label="Reset zoom"]')).toBeEnabled();
  await plot.execute((element) => {
    element.focus();
  });
  // The embedded driver maps arrows but not Home/End; those are covered by component tests.
  await browser.keys([Key.ArrowRight, Key.Enter]);
  await expect(results.$('[data-testid="concordance-dispersion"] .sr-only:last-child')).toHaveText(
    '2 chart points selected.',
  );
  await expect(results.$('button[aria-label="Reset zoom"]')).toBeEnabled();
  await results.$('button=Clear selection').click();
  await results.$('button[aria-label="Reset zoom"]').click();
  await results.$('button=Select range').click();
  await expect(results.$('button=Select range')).toHaveAttribute('aria-pressed', 'true');
  const range = (await plot.execute((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x1: Math.round(rect.left + 43),
      x2: Math.round(rect.left + 42 + (rect.width - 58) * 0.2),
      y: Math.round(rect.top + 70),
    };
  })) as { x1: number; x2: number; y: number };
  await browser
    .action('pointer')
    .move({ x: range.x1, y: range.y })
    .down()
    .move({ x: range.x2, y: range.y, duration: 400 })
    .up()
    .perform();
  await expect(results.$('button=cat (2/4)')).toExist();
  await plot.execute((element) => {
    element.focus();
  });
  await browser.keys(Key.Escape);
  await expect(results.$('button=Select range')).toHaveAttribute('aria-pressed', 'false');
  await results.$('button=Table').click();
  await expect(results).toHaveText(expect.stringContaining('4 matches'));
  await results.$('button=Dispersion').click();
  await expect(results.$('button=cat (2/4)')).toExist();
  await expect(results.$('button=Preview')).not.toExist();
  await expect(results.$('button=Saved results')).not.toExist();
  await expect(request.$('button=Preview')).toHaveAttribute('aria-disabled', 'true');
  await results.$('button=Clear selection').click();
  await browser.saveScreenshot(`.tmp/wdio/${prefix}-concordance-dispersion.png`);
  await results.$('button=Add to Project').execute((element) => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await results.$('button=Add to Project').click();
  await browser.keys(Key.ArrowDown);
  await $('[role="menuitem"]=Documents').waitForDisplayed();
  await $('[role="menuitem"]=Documents').click();
  const dialog = $('[role="dialog"][data-state="open"]');
  await dialog.waitForDisplayed();
  await dialog.$('button=Add').click();
  await dialog.waitForExist({ reverse: true });
  await browser.waitUntil(async () =>
    (await api.graph(base)).nodes.some(
      (node) => node.table_name === `${name}_concordance_documents`,
    ),
  );
  for (const theme of ['light', 'dark']) {
    await $('button[aria-label="Open settings"]').click();
    const toggle = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    if (((await toggle.getAttribute('aria-checked')) === 'true') !== (theme === 'dark'))
      await toggle.click();
    await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    await expect($('html')).toHaveAttribute('data-theme', theme + '-2026');
    for (const narrow of [false, true]) {
      await setAnalysisPaneSize(narrow ? 'narrow' : 'normal');
      await results.$('[aria-roledescription="interactive chart"]').execute((element) => {
        element.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await browser.waitUntil(
        () =>
          results.$('[aria-roledescription="interactive chart"]').execute((element) => {
            const svg = element.querySelector('svg');
            return Boolean(
              svg && Math.abs(Number(svg.getAttribute('width')) - element.clientWidth) < 2,
            );
          }),
        { timeoutMsg: 'Concordance chart has not resized to its pane' },
      );

      await browser.saveScreenshot(
        '.tmp/wdio/' + prefix + '-concordance-' + theme + (narrow ? '-narrow' : '') + '.png',
      );
    }
  }
  await setAnalysisPaneSize('normal');

  await api.executeSql(base, [{ sql: `DROP TABLE ${api.identifier(name)}` }], {
    objects: [{ schema: 'data', name }],
    resources: ['graph'],
  });
  await results.$('button=Table').scrollIntoView();
  await results.$('button=Table').click();
  await results.$('button=cat').waitForExist();
  // Reload only after the presentation write has reached the backend.
  await browser.waitUntil(async () =>
    (await api.listTabs(base, undefined, 'concordance')).find((item) => item.id === tab.id)
      ?.settings.presentation === 'table',
  );
  await browser.refresh();
  await $('button=Concordance').waitForEnabled();
  await $('button=Concordance').click();
  await results.$('button=cat').waitForExist();
  await expect($('[data-testid="concordance-workspace"]')).toBeDisplayed();
}
