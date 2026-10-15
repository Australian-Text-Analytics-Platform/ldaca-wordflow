import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { hover, post, role } from './fixtures';

it('finds an accessible action that becomes visible after the first lookup', async () => {
  const imported = await post('/api/project/import', {
    sources: [{ table_name: 'late_action', sql: 'SELECT 1 AS n' }],
  });
  expect(imported.ok).toBe(true);
  await browser.url('/');
  const row = role('button', { name: 'Select late_action', exact: true });
  await row.waitForDisplayed();
  const action = await role('button', { name: 'Actions for late_action', exact: true }, row).getElement();
  await expect(action).not.toExist();
  await hover(row);
  await action.click();
  await expect(role('menuitem', { name: 'Clone', exact: true })).toBeDisplayed();
});

it('finds a nested accessible action after its sidebar row is mounted again', async () => {
  const imported = await post('/api/project/import', {
    sources: [{ table_name: 'replaced_action', sql: 'SELECT 1 AS n' }],
  });
  expect(imported.ok).toBe(true);
  await browser.url('/');
  const row = role('button', { name: 'Select replaced_action', exact: true });
  await hover(row);
  const action = await role('button', { name: 'Actions for replaced_action', exact: true }, row).getElement();
  await expect(action).toBeDisplayed();
  await role('button', { name: /^Data Blocks/ }).click();
  await role('button', { name: /^Data Blocks/ }).click();
  await hover(role('button', { name: 'Select replaced_action', exact: true }));
  await action.click();
  await expect(role('menuitem', { name: 'Clone', exact: true })).toBeDisplayed();
});
