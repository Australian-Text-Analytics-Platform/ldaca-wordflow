import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { hover, role, post, rect, press, screenshot } from './fixtures';

it('imports, materialization and table edits keep explicit object ownership', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  const imported = await post('/api/project/import', {
    sources: [
      {
        table_name: 'test',
        sql: "SELECT '12' AS amount, 'red' AS label UNION ALL SELECT '34', 'blue'",
      },
    ],
  });
  expect(imported.ok).toBe(true);
  const metadata = await post('/api/project/sql', {
    statements: [
      {
        sql: "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','test',json_array('label'),'test.annotation',NULL)",
      },
      {
        sql: "INSERT INTO wordflow.tokenizer_models VALUES ('test','label','native:plain_words_en')",
      },
      { sql: "UPDATE wordflow.nodes SET document_column='label' WHERE table_name='test'" },
    ],
  });
  expect(metadata.ok).toBe(true);
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  const card = browser.$('[data-id=' + JSON.stringify('test') + ']');
  await expect(card).toHaveText(expect.stringContaining('Type: View'));
  await expect(role('button', { name: 'Select test_raw', exact: true })).not.toExist();
  const initialCardBounds = await rect(card);
  await role('button', { name: 'Select test', exact: true }).click();
  await press('End', role('separator', { name: 'Resize graph and data panels' }));
  await browser
    .action('pointer', { id: 'mouse' })
    .move({ x: Math.round(50), y: Math.round(50), duration: 0 })
    .perform(true);
  await hover(card);
  expect(await rect(card)).toEqual(initialCardBounds);
  const menuBounds = await rect(role('button', { name: 'Data Block actions' }));

  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(menuBounds.x + menuBounds.width / 2),
      y: Math.round(menuBounds.y + menuBounds.height / 2),
      duration: 200,
    })
    .perform(true);
  await role('button', { name: 'Data Block actions' }).click();
  await screenshot('/tmp/wordflow-materialize-menu-light.png');
  await role('menuitem', { name: 'Materialize', exact: true }).click();
  await expect(card).toHaveText(expect.stringContaining('Type: Table'));
  await role('button', { name: 'Change data type for column amount' }).click();
  await role('menuitemradio', { name: 'integer', exact: true }).click();
  await expect(role('button', { name: 'Change data type for column amount' })).toHaveText(
    expect.stringContaining('integer'),
  );
  await expect(card).toHaveText(expect.stringContaining('Type: Table'));
  await expect(role('button', { name: 'Undo Data Block edit' })).toBeDisabled();
  await role('button', { name: 'Change data type for column label' }).click();
  await role('menuitemradio', { name: 'categorical', exact: true }).click();
  await expect(role('button', { name: 'Change data type for column label' })).toHaveText(
    expect.stringContaining('categorical'),
  );
  await role('button', { name: 'Column settings for label' }).click();
  await role('menuitem', { name: 'Rename', exact: true }).click();
  await press('ControlOrMeta+a', role('textbox', { name: 'Rename column label' }));
  await role('textbox', { name: 'Rename column label' }).addValue('group');
  await press('Enter', role('textbox', { name: 'Rename column label' }));
  await expect(role('button', { name: 'Column settings for group' })).toBeDisplayed();
  await role('button', { name: 'Column settings for group' }).click();
  await role('menuitem', { name: 'Delete', exact: true }).click();
  // Column deletion uses the existing confirmation dialog.
  const confirm = role('alertdialog');
  await role('button', { name: /Delete/ }, confirm).click();
  await expect(role('button', { name: 'Column settings for group' })).not.toExist();
  const checked = await post('/api/project/sql', {
    statements: [
      {
        sql: "SELECT CASE WHEN (SELECT count(*) FROM wordflow.nodes)=2 AND (SELECT count(*) FROM wordflow.arrow_metadata)=0 AND (SELECT count(*) FROM wordflow.tokenizer_models)=0 AND (SELECT document_column FROM wordflow.nodes WHERE table_name='test') IS NULL AND (SELECT min(amount) FROM data.test)=12 AND (SELECT min(amount) FROM data.test_raw)='12' THEN 1 ELSE error('Unexpected object changes') END",
      },
    ],
  });
  expect(checked.ok).toBe(true);
  await browser
    .action('pointer', { id: 'mouse' })
    .move({ x: Math.round(50), y: Math.round(50), duration: 0 })
    .perform(true);
  await hover(card);
  const updatedMenuBounds = await rect(role('button', { name: 'Data Block actions' }));

  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(updatedMenuBounds.x + updatedMenuBounds.width / 2),
      y: Math.round(updatedMenuBounds.y + updatedMenuBounds.height / 2),
      duration: 200,
    })
    .perform(true);
  await role('button', { name: 'Data Block actions' }).click();
  await expect(role('menuitem', { name: 'Materialize', exact: true })).not.toExist();
  await screenshot('/tmp/wordflow-table-edits-light.png');
});
