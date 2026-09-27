import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, text, texts, testId, press, screenshot } from './fixtures';

import * as api from '../src/features/project/api';
const base = 'http://127.0.0.1:3212';

it('SQL cells persist, format, paginate captured writes and remain independent of graph previews', async () => {
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'SQL', exact: true }).click();
  const console = testId('sql-console');
  const editor = console.$('.cm-content');
  const script =
    'CREATE TABLE "SQL Example" AS SELECT range AS n FROM range(45); SELECT n, 9007199254740993::BIGINT AS exact FROM "SQL Example";';
  await expect(editor).toBeDisplayed();
  await editor.setValue(script);
  await press('ControlOrMeta+Enter', editor);
  await expect(text('2 statements completed · 45 displayed rows', {}, console)).toBeDisplayed();
  await expect(role('cell', { name: '9007199254740993', exact: true }, console)).toBeDisplayed();
  await role('link', { name: /next page/i }, console).click();
  await expect(role('cell', { name: '20', exact: true }, console)).toBeDisplayed();
  const count = await api.querySql(base, [{ sql: 'SELECT count(*) AS n FROM "SQL Example"' }]);
  expect(String(count.getChild('n')?.get(0))).toBe('45');
  await expect(role('button', { name: 'Select SQL Example', exact: true })).not.toExist();
  await expect(text(/Outdated result/, {}, console)).not.toExist();
  await editor.setValue('select n as "MixedCase" from "SQL Example" where n > 1');
  await press('ControlOrMeta+Alt+o', editor);
  await expect(editor).toHaveText(expect.stringContaining('"MixedCase"'));
  await expect(editor.$$('.cm-line')).not.toBeElementsArrayOfSize(1);
  await expect(text(/Outdated result/, {}, console)).toBeDisplayed();
  await role('button', { name: 'Cell 1 options' }, console).click();
  await role('menuitem', { name: 'Duplicate cell' }).click();
  await expect(console.$$('.cm-content')).toBeElementsArrayOfSize(2);
  await expect(
    texts('2 statements completed · 45 displayed rows', {}, console),
  ).toBeElementsArrayOfSize(1);
  await role('button', { name: 'Cell 2 options' }, console).click();
  await role('menuitem', { name: 'Move cell up' }).click();
  await expect(role('button', { name: 'Cell 1 options' }, console)).toBeEnabled();
  await role('button', { name: 'Move cell 1', exact: true }, console).dragAndDrop(
    role('button', { name: 'Move cell 2', exact: true }, console),
  );
  await expect(console.$('[aria-label="SQL cell 1"]')).toHaveText(
    expect.stringContaining('2 statements completed'),
  );

  for (const theme of ['light-2026', 'dark-2026']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', value);
      document.documentElement.style.colorScheme = value.startsWith('dark') ? 'dark' : 'light';
    }, theme);
    await browser.setViewport({ width: 1200, height: 950 });
    const background = theme === 'dark-2026' ? 'rgba(25,26,27,1)' : 'rgba(255,255,255,1)';
    await expect(console.$('.cm-editor')).toHaveStyle({ 'background-color': background });
    await expect(role('button', { name: 'Run cell 1' }, console)).toHaveStyle({
      'background-color': background,
    });
    await screenshot(`sql-console-${theme}.png`);
  }
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'SQL', exact: true }).click();
  await expect(console.$$('.cm-content')).toBeElementsArrayOfSize(1);
  await expect(console.$('.cm-content')).toHaveText(expect.stringContaining('"MixedCase"'));
  await expect(text(/statements? completed/, {}, console)).not.toExist();
});

it('Live previews are read only, truncate output and do not execute persisted cells on mount', async () => {
  await api.executeSql(base, [
    { sql: "INSERT INTO wordflow.sql_cells VALUES (uuid(),0,'SELECT 1','live')" },
  ], { all: true });
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'SQL', exact: true }).click();
  const console = testId('sql-console');
  const editor = console.$('.cm-content');
  await expect(editor).toBeDisplayed();
  await expect(text(/statement completed/, {}, console)).not.toExist();
  await editor.setValue('SELECT range AS n FROM range(50001)');
  await expect(text(/Showing the first 50,000 rows/, {}, console)).toBeDisplayed();
  await role('link', { name: '2500', exact: true }, console).click();
  await expect(role('cell', { name: '50000', exact: true }, console)).not.toExist();
  await expect(role('cell', { name: '49999', exact: true }, console)).toBeDisplayed();
  await editor.setValue('SELECT (');
  await expect(text('Waiting for one complete query', {}, console)).toBeDisplayed();
  await expect(text(/Outdated result/, {}, console)).toBeDisplayed();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
});
