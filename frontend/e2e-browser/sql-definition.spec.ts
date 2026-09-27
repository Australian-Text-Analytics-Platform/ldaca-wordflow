import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { hover, role, post, rect, press, screenshot } from './fixtures';

it('view SQL is editable through the shared More hover submenu', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  const imported = await post('/api/project/import', {
    sources: [{ table_name: 'test', sql: "SELECT '12' AS amount UNION ALL SELECT '34'" }],
  });
  expect(imported.ok).toBe(true);
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await role('button', { name: 'Select test', exact: true }).click();
  await press('End', role('separator', { name: 'Resize graph and data panels' }));
  const card = browser.$('[data-id=' + JSON.stringify('test') + ']');
  await hover(card);
  await role('button', { name: 'Data Block actions' }).click();
  const more = () => role('menuitem', { name: 'More', exact: true });
  await hover(more());
  const edit = () => role('menuitem', { name: 'Edit SQL Definition', exact: true });
  await expect(edit()).toBeDisplayed();
  const target = await rect(edit());

  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(target.x + target.width / 2),
      y: Math.round(target.y + target.height / 2),
      duration: 200,
    })
    .perform(true);
  await expect(edit()).toBeDisplayed();
  await screenshot('/tmp/wordflow-sql-more-light.png');
  await edit().click();
  const dialog = () => role('dialog', { name: 'Edit SQL Definition' });
  const input = () => role('textbox', { name: 'SQL definition' }, dialog());
  await expect(input()).toHaveValue(/test_raw/);
  const original = await input().getValue();
  await input().setValue('SELECT 99 AS amount');
  await role('button', { name: 'Cancel', exact: true }, dialog()).click();
  await expect(dialog()).not.toExist();

  // The sidebar uses the same More component, including keyboard submenu access.
  const row = role('button', { name: 'Deselect test', exact: true });
  await hover(row);
  await role('button', { name: 'Actions for test', exact: true }).click();
  await (await more().getElement()).execute((element) => {
    element.focus();
  });
  await press('ArrowRight');
  await expect(edit()).toBeDisplayed();
  await press('Enter');
  await expect(input()).toHaveValue(original);
  expectAppError(/absent/);
  await input().setValue('SELECT absent FROM test_raw');
  await role('button', { name: 'Save', exact: true }, dialog()).click();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(dialog()).toBeDisplayed();
  await expect(input()).toHaveValue('SELECT absent FROM test_raw');
  await role('button', { name: 'Show details', exact: true }).click();
  await expect(browser.$('[data-sonner-toast]')).toHaveText(expect.stringContaining('absent'));
  await input().setValue(
    "SELECT CAST(amount AS INTEGER) AS amount FROM test_raw WHERE amount = '34'",
  );
  await screenshot('/tmp/wordflow-sql-editor-light.png');
  await role('button', { name: 'Save', exact: true }, dialog()).click();
  await expect(dialog()).not.toExist();
  await hover(card);
  await expect(card).toHaveText(expect.stringContaining('Columns: 1'));
  await expect(role('cell', { name: '34', exact: true })).toBeDisplayed();
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await hover(card);
  await role('button', { name: 'Data Block actions' }).click();
  const position = await card.getAttribute('style');
  await (await more().getElement()).execute((element) => {
    element.focus();
  });
  await press('ArrowRight');
  await expect(edit()).toBeDisplayed();
  await press('Enter');
  await expect(input()).toHaveValue(/INTEGER/);
  await expect(card).toHaveAttribute('style', position ?? '');
  await role('button', { name: 'Cancel', exact: true }, dialog()).click();
  await hover(card);
  await role('button', { name: 'Data Block actions' }).click();
  await role('menuitem', { name: 'Materialize', exact: true }).click();
  await expect(card).toHaveText(expect.stringContaining('Type: Table'));
  await hover(card);
  await role('button', { name: 'Data Block actions' }).click();
  await expect(more()).toBeEnabled();
  await (await more().getElement()).execute((element) => {
    element.focus();
  });
  await press('ArrowRight');
  await expect(role('menuitem', { name: 'Edit Table', exact: true })).toBeDisplayed();
  await expect(edit()).not.toExist();
});
