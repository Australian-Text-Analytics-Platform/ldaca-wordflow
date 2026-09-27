import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, testId, post, rect, press, screenshot } from './fixtures';

it('graph menus use actual collision bounds and keep keyboard navigation', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  await post('/api/project/sql', {
    statements: [
      { sql: 'CREATE TABLE menu_edge AS SELECT 1 AS n' },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('menu_edge')" },
    ],
  });
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  const card = testId('custom-node-card');
  await expect(card).toBeDisplayed();
  await browser.$('.react-flow__viewport').waitForStable();
  const graph = browser.$('.react-flow');
  const area = await rect(graph);
  const start = await rect(card);
  await browser
    .action('pointer', { id: 'mouse' })
    .move({ x: Math.round(start.x + 30), y: Math.round(start.y + 20), duration: 0 })
    .perform(true);
  await browser.action('pointer', { id: 'mouse' }).down()
    // React Flow starts its drag on the first move beyond the click threshold.
    .move({ x: Math.round(start.x + 35), y: Math.round(start.y + 25), duration: 50 })
    .perform(true);
  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(area.x + area.width - start.width + 15),
      y: Math.round(area.y + area.height - start.height + 5),
      duration: 200,
    })
    .perform(true);
  await browser.action('pointer', { id: 'mouse' }).up().perform(true);
  expect((await rect(card)).y).toBeGreaterThan(start.y + 200);
  const trigger = role('button', { name: 'Data Block actions' });
  const action = await rect(trigger);

  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(action.x + action.width / 2),
      y: Math.round(action.y + action.height / 2),
      duration: 200,
    })
    .perform(true);
  await trigger.click();
  const menu = role('menu');
  await expect(menu).toBeDisplayed();
  const bounds = await rect(menu);

  expect(bounds.x).toBeGreaterThanOrEqual(area.x);
  expect(bounds.y).toBeGreaterThanOrEqual(area.y);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height);
  for (const theme of ['light-2026', 'dark-2026']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', value);
      document.documentElement.style.colorScheme = value.startsWith('dark') ? 'dark' : 'light';
    }, theme);
    await screenshot(`graph-menu-${theme}.png`);
  }
  await press('Home');
  await expect(role('menuitem', { name: 'Rename', exact: true })).toBeFocused();
  await press('Enter');
  await expect(role('textbox', { name: 'New Data Block name' })).toBeDisplayed();
  await press('Escape');
  await expect(role('alertdialog')).not.toExist();
});
