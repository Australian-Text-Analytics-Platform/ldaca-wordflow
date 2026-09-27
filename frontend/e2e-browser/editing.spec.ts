import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { hover, role, post, checked, rect, press, screenshot } from './fixtures';

it('Edit Table keeps drafts across pages, retries Save and discards Cancel', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  const seed = await post('/api/project/sql', {
    response: 'command',
    statements: [
      {
        sql: 'CREATE TABLE data.documents (key INTEGER PRIMARY KEY, text VARCHAR, amount DECIMAL(38,10), stamp TIMESTAMP_NS)',
      },
      {
        sql: "INSERT INTO data.documents SELECT i, 'Row ' || i, 12345678901234567890.1234567890, TIMESTAMP_NS '2024-01-02 03:04:05.123456789' FROM range(55) t(i)",
      },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('documents')" },
    ],
  });
  expect(seed.ok).toBe(true);
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  const row = role('button', { name: 'Select documents', exact: true });
  await hover(row);
  await role('button', { name: 'Actions for documents' }, row).click();
  await hover(role('menuitem', { name: 'More', exact: true }));
  await role('menuitem', { name: 'Edit Table', exact: true }).click();
  const dialog = () => role('dialog', { name: 'Edit Table', exact: true });
  await expect(role('textbox', { name: 'Edit stamp' }, dialog())).toHaveValue(
    '2024-01-02 03:04:05.123456789',
  );
  await expect(role('textbox', { name: 'Edit amount' }, dialog())).toHaveValue(
    '12345678901234567890.1234567890',
  );
  await role('textbox', { name: 'Edit text' }, dialog()).setValue('changed zero');
  await role('link', { name: 'Go to next page' }, dialog()).click();
  await expect(role('textbox', { name: 'Edit key', exact: true }, dialog())).toHaveValue('20');
  await role('textbox', { name: 'Edit text' }, dialog()).setValue('changed twenty');
  await role('link', { name: 'Go to previous page' }, dialog()).click();
  await expect(role('textbox', { name: 'Edit text' }, dialog())).toHaveValue('changed zero');
  await screenshot('/tmp/wordflow-cell-edit-light.png');
  expectAppError(/Duplicate key|PRIMARY KEY|UNIQUE constraint/i);
  await role('textbox', { name: 'Edit key', exact: true }, dialog()).setValue('1');
  await role('button', { name: 'Save', exact: true }, dialog()).click();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(role('textbox', { name: 'Edit text' }, dialog())).toHaveValue('changed zero');
  await role('textbox', { name: 'Edit key', exact: true }, dialog()).setValue('100');
  await role('button', { name: 'Save', exact: true }, dialog()).click();
  await expect(dialog()).not.toExist();
  const check = await post('/api/project/sql', {
    statements: [
      {
        sql: "SELECT CASE WHEN count(*) FILTER (WHERE key=100 AND text='changed zero')=1 AND count(*) FILTER (WHERE key=20 AND text='changed twenty')=1 THEN 1 ELSE error('Lost edits') END FROM data.documents",
      },
    ],
  });
  expect(check.ok).toBe(true);
  await role('button', { name: 'Open settings', exact: true }).click();
  await checked(role('switch', { name: 'Use Dark 2026 theme' }), true);
  await role(
    'button',
    { name: 'Close', exact: true },
    role('dialog', { name: 'Settings', exact: true }),
  ).click();
  // Graph hover menu shares the same entry point.
  await hover(browser.$('[data-id=' + JSON.stringify('documents') + ']'));
  await role('button', { name: 'Data Block actions' }).click();
  await hover(role('menuitem', { name: 'More', exact: true }));
  const editItem = role('menuitem', { name: 'Edit Table', exact: true });
  const editBox = await rect(editItem);

  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(editBox.x + editBox.width / 2),
      y: Math.round(editBox.y + editBox.height / 2),
      duration: 200,
    })
    .perform(true);
  await editItem.click();
  await role('textbox', { name: 'Edit text' }, dialog()).setValue('discard this');
  await screenshot('/tmp/wordflow-cell-edit-dark.png');
  await press('Escape');
  await role('button', { name: 'Keep editing' }, role('alertdialog')).click();
  await expect(role('textbox', { name: 'Edit text' }, dialog())).toHaveValue('discard this');
  await role('button', { name: 'Cancel', exact: true }, dialog()).click();
  await role('button', { name: 'Discard changes' }, role('alertdialog')).click();
  await expect(dialog()).not.toExist();
  const unchanged = await post('/api/project/sql', {
    statements: [
      {
        sql: "SELECT CASE WHEN count(*)=0 THEN 1 ELSE error('Cancel wrote data') END FROM data.documents WHERE text='discard this'",
      },
    ],
  });
  expect(unchanged.ok).toBe(true);
});

it('row controls keep additions and deletions pending until atomic Save', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  const seed = await post('/api/project/sql', {
    response: 'command',
    statements: [
      {
        sql: 'CREATE TABLE data.row_actions (key BIGINT PRIMARY KEY, text VARCHAR, amount DECIMAL(38,10))',
      },
      {
        sql: "INSERT INTO data.row_actions SELECT i, 'Row ' || i, 0 FROM range(325) t(i)",
      },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('row_actions')" },
    ],
  });
  expect(seed.ok).toBe(true);
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  const node = role('button', { name: 'Select row_actions', exact: true });
  await hover(node);
  await role('button', { name: 'Actions for row_actions' }, node).click();
  await hover(role('menuitem', { name: 'More', exact: true }));
  await role('menuitem', { name: 'Edit Table', exact: true }).click();
  const dialog = () => role('dialog', { name: 'Edit Table', exact: true });
  await role('button', { name: 'Add row above' }, dialog()).click();
  const added = role('row', { index: 1 }, dialog());
  await expect(role('textbox', { name: 'Edit key', exact: true }, added)).toBeEnabled();
  await role('textbox', { name: 'Edit key', exact: true }, added).setValue('9007199254740993');
  await expect(role('textbox', { name: 'Edit text', exact: true }, added)).toBeEnabled();
  await role('textbox', { name: 'Edit text', exact: true }, added).setValue('Inserted above zero');
  await role('button', { name: 'Delete row', index: 1 }, dialog()).click();
  await expect(role('textbox', { name: 'Edit text', index: 1 }, dialog())).toHaveValue('Row 1');
  await screenshot('/tmp/wordflow-row-actions-light.png');
  await role('link', { name: 'Go to next page' }, dialog()).click();
  await expect(role('textbox', { name: 'Edit key', exact: true }, dialog())).toHaveValue('20');
  await role('button', { name: 'Delete row' }, dialog()).click();
  await role('link', { name: 'Go to previous page' }, dialog()).click();
  await expect(role('textbox', { name: 'Edit text' }, dialog())).toHaveValue('Inserted above zero');
  await role('link', { name: '17', exact: true }, dialog()).click();
  await expect(role('textbox', { name: 'Edit key', exact: true }, dialog())).toHaveValue('320');
  await expect(role('link', { name: 'Go to next page' }, dialog())).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await screenshot('/tmp/wordflow-edit-last-page.png');
  await role('link', { name: '1', exact: true }, dialog()).click();
  await expect(role('textbox', { name: 'Edit text' }, dialog())).toHaveValue('Inserted above zero');
  expectAppError(/Duplicate key|PRIMARY KEY|UNIQUE constraint/i);
  await role('textbox', { name: 'Edit key', exact: true }, dialog()).setValue('1');
  await role('button', { name: 'Save', exact: true }, dialog()).click();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(role('textbox', { name: 'Edit text' }, dialog())).toHaveValue('Inserted above zero');
  await role('textbox', { name: 'Edit key', exact: true }, dialog()).setValue('9007199254740993');
  await role('button', { name: 'Save', exact: true }, dialog()).click();
  await expect(dialog()).not.toExist();
  const check = await post('/api/project/sql', {
    statements: [
      {
        sql: "SELECT CASE WHEN count(*)=324 AND count(*) FILTER(WHERE key IN (0,20))=0 AND count(*) FILTER(WHERE key=9007199254740993 AND text='Inserted above zero' AND amount IS NULL)=1 THEN 1 ELSE error('Row edits failed') END FROM data.row_actions",
      },
    ],
  });
  expect(check.ok).toBe(true);
});
