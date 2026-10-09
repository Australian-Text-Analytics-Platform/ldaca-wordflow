import { setTestPreferences } from './fixtures';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, label, testId, testIds, post, rect, press, screenshot } from './fixtures';

for (const theme of ['light-2026', 'dark-2026']) {
  it(`content-sized cards and upper/lower Data View preserve graph controls in ${theme}`, async () => {
    await setTestPreferences({ theme });
    await browser.url('/');
    await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
    const longName = 'A much longer table name that wraps onto several lines in the graph';
    const seeded = await post('/api/project/sql', {
      response: 'command',
      statements: [
        { sql: 'CREATE TABLE data.short AS SELECT 1 AS value' },
        { sql: `CREATE TABLE data."${longName}" AS SELECT 2 AS value` },
        { sql: `INSERT INTO wordflow.nodes(table_name) VALUES ('short'), ('${longName}')` },
        { sql: `INSERT INTO wordflow.edges VALUES ('short', '${longName}')` },
      ],
    });
    expect(seeded.ok).toBe(true);
    await browser.refresh();
    await browser.$('[aria-label="Data Block graph"]').waitForExist();
    const graph = label('Data Block graph', { exact: true });
    const shortCard = browser.$(
      '[data-id=' + JSON.stringify('short') + '] [data-testid="custom-node-card"]',
    );
    const longCard = browser.$(
      '[data-id=' + JSON.stringify(longName) + '] [data-testid="custom-node-card"]',
    );
    await expect(shortCard).toBeDisplayed();
    await expect(longCard).toBeDisplayed();
    const shortHeight = await (await shortCard.getElement()).execute(
      (element) => element.clientHeight,
    );
    const longHeight = await (await longCard.getElement()).execute(
      (element) => element.clientHeight,
    );
    expect(shortHeight).toBeLessThan(120);
    expect(longHeight).toBeGreaterThan(shortHeight);
    const parentBounds = await rect(shortCard);
    const childBounds = await rect(longCard);
    expect(childBounds.y).toBeGreaterThan(parentBounds.y + parentBounds.height);
    expect(childBounds.x).toBeCloseTo(parentBounds.x, 0);
    await expect(shortCard.$('.react-flow__handle.source')).toHaveAttribute(
      'class',
      /react-flow__handle-bottom/,
    );
    await expect(longCard.$('.react-flow__handle.target')).toHaveAttribute(
      'class',
      /react-flow__handle-top/,
    );
    await screenshot(`cards-${theme}.png`);
    await role('button', { name: 'Zoom in', exact: true }).click();
    const viewport = graph.$('.react-flow__viewport');
    const transform = await (await viewport.getElement()).execute(
      (element) => element.style.transform,
    );
    const graphBounds = await rect(graph);
    const cardBottoms = await browser.execute(() => ({
      graph: document
        .querySelector('[aria-label="Data Block graph"]')
        ?.closest('.rounded-lg')
        ?.getBoundingClientRect().bottom,
      main: document.querySelector('[role="main"]')?.firstElementChild?.getBoundingClientRect()
        .bottom,
    }));
    expect(cardBottoms.graph).toBe(cardBottoms.main);
    await role('button', { name: 'Select short', exact: true }).click();
    const data = testId('project-data-overlay');
    await expect(role('button', { name: 'Sort by value' })).toBeDisplayed();
    const upper = await rect(graph);
    const lower = await rect(data);
    expect(upper.height).toBeLessThan(graphBounds.height - 100);
    expect(lower.y).toBeGreaterThanOrEqual(upper.y + upper.height);
    expect(await viewport.execute((element) => element.style.transform)).toBe(transform);
    const resize = role('separator', { name: 'Resize graph and data panels' });
    await expect(resize).toHaveAttribute('data-variant', 'grip');
    await expect(resize.$('[data-slot="resize-handle-grip"]')).toExist();
    await screenshot(`editor-open-${theme}.png`);
    await press('End', resize);
    await browser.waitUntil(async () => (await rect(graph)).height > upper.height);
    expect((await rect(data)).height).toBeGreaterThanOrEqual(120);
    await press('Home', resize);
    await browser.waitUntil(async () => (await rect(graph)).height < upper.height);
    const topPanelHeight = await graph.execute((element) =>
      element.closest('.min-h-30')?.getBoundingClientRect().height,
    );
    expect(topPanelHeight).toBeGreaterThanOrEqual(120);
    const toggle = role('button', { name: 'Data View', exact: true });
    await toggle.click();
    await expect(data).not.toBeDisplayed();
    await expect(resize).not.toExist();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(role('button', { name: 'Sort by value' })).toBeDisplayed();
    await role('button', { name: 'Close preview', exact: true }).click();
    await expect(data).not.toExist();
    await browser.waitUntil(async () => Math.abs((await rect(graph)).height - graphBounds.height) < 1);
    await role('button', { name: `Select ${longName}`, exact: true }).click();
    await expect(testId('project-data-overlay')).toHaveText(expect.stringContaining(longName));
    await role('button', { name: 'Close preview', exact: true }).click();
    await expect(testId('project-data-overlay')).not.toExist();
    for (let step = 0; step < 6; step++) {
      await role('button', { name: 'Zoom out', exact: true }).click();
    }
    await expect(testIds('custom-node-compact-card', {}, graph)).toBeElementsArrayOfSize(2);
    for await (const card of testIds('custom-node-compact-card', {}, graph)) {
      await expect(card.$('.react-flow__handle.target')).toHaveAttribute(
        'class',
        /react-flow__handle-top/,
      );
      await expect(card.$('.react-flow__handle.source')).toHaveAttribute(
        'class',
        /react-flow__handle-bottom/,
      );
    }
    await screenshot(`cards-compact-${theme}.png`);
  });
}
