import { expectAppError } from './diagnostics';
import { readFile, access, rm } from 'node:fs/promises';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import {
  hover,
  role,
  text,
  testId,
  post,
  outputDir,
  rect,
  press,
  screenshot,
  captureResponse,
} from './fixtures';

it('restored native controls retain selection, pagination and SQL editing', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  const seed = await post('/api/project/sql', {
    statements: [
      {
        sql: 'CREATE VIEW data.pages AS SELECT i::BIGINT x, (i % 3)::VARCHAR category FROM range(55) t(i)',
      },
      { sql: 'CREATE VIEW data.following AS SELECT * FROM data.pages' },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('pages'),('following')" },
      { sql: "INSERT INTO wordflow.edges VALUES ('pages','following')" },
    ],
  });
  expect(seed.ok).toBe(true);
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await role('button', { name: 'Select pages', exact: true }).click();
  await expect(role('cell', { name: '0', exact: true })).toBeDisplayed();
  await role('link', { name: 'Go to next page' }).click();
  await expect(role('cell', { name: '20', exact: true })).toBeDisplayed();
  await role('button', { name: 'Select following', exact: true }).click();
  await expect(testId('project-data-node-label')).toHaveText('following');
  await role('button', { name: 'Deselect pages', exact: true }).click();
  await role('button', { name: 'Select pages', exact: true }).click();
  await expect(role('cell', { name: '20', exact: true })).toBeDisplayed();
  await role('button', { name: 'Pin column x to the start' }).click();
  await expect(role('button', { name: 'Unpin column x' })).toBeDisplayed();
  const dragged = browser.$('[data-id=' + JSON.stringify('pages') + ']');
  const header = await rect(dragged);

  await browser
    .action('pointer', { id: 'mouse' })
    .move({ x: Math.round(header.x + 40), y: Math.round(header.y + 10), duration: 0 })
    .down()
    .move({ x: Math.round(header.x + 65), y: Math.round(header.y + 25), duration: 200 })
    .up()
    .perform(true);
  const position = await (await dragged.getElement()).execute((element) => element.style.transform);
  await role('button', { name: 'Change data type for column category' }).click();
  await role('menuitemradio', { name: 'categorical', exact: true }).click();
  await expect(role('button', { name: 'Change data type for column category' })).toHaveText(
    expect.stringContaining('categorical'),
  );
  expect(await (await dragged.getElement()).execute((element) => element.style.transform)).toBe(
    position,
  );
  await expect(role('button', { name: 'Undo Data Block edit' })).toBeEnabled();
  await expect(role('button', { name: 'Redo Data Block edit' })).toBeDisabled();
  await role('button', { name: 'Sort by category' }).click();
  const invalidPages: string[] = [];
  await browser.sessionSubscribe({ events: ['network.responseCompleted'] });
  browser.on('network.responseCompleted', (event) => {
    if (event.request.url.endsWith('/page') && event.response.status >= 400)
      invalidPages.push(event.request.url);
  });
  await role('button', { name: 'Column settings for category' }).click();
  await role('menuitem', { name: 'Rename', exact: true }).click();
  await press('ControlOrMeta+a', role('textbox', { name: 'Rename column category' }));
  await role('textbox', { name: 'Rename column category' }).addValue('group_name');
  const renamedPage = await captureResponse(
    '/api/project/nodes/pages/page',
    () => press('Enter', role('textbox', { name: 'Rename column category' })),
    'group_name',
  );
  await expect(role('button', { name: 'Column settings for group_name' })).toBeDisplayed();
  expect(renamedPage.response.status).toBe(200);
  await role('button', { name: 'Undo Data Block edit' }).click();
  await expect(role('button', { name: 'Column settings for category' })).toBeDisplayed();
  await expect(role('cell', { name: '0', exact: true })).toBeDisplayed();
  expect(invalidPages).toEqual([]);
  const rail = role('button', { name: 'Zoom in' });
  const box = await rect(rail);
  await browser
    .action('pointer', { id: 'mouse' })
    .move({ x: Math.round(box.x + 5), y: Math.round(box.y + 5), duration: 0 })
    .perform(true);
  const transfer = browser.action('pointer', { id: 'mouse' });
  for (let step = 1; step <= 15; step++)
    transfer.move({ x: Math.round(box.x + 5 + step * 7), y: Math.round(box.y + 5), duration: 20 });
  await transfer.perform(true);
  await browser.waitUntil(async () => (await rect(rail)).width > 100);
  for (let i = 0; i < 7; i++) {
    await role('button', { name: 'Zoom out' }).click();
  }
  await expect(testId('custom-node-compact-card')).toBeDisplayed();
  await role('button', { name: 'Fit view' }).click();
  await role('button', { name: 'Rename node' }).click();
  await press('ControlOrMeta+a', role('textbox', { name: 'Node name' }));
  await role('textbox', { name: 'Node name' }).addValue('renamed_pages');
  await press('Enter', role('textbox', { name: 'Node name' }));
  await expect(role('button', { name: 'Deselect renamed_pages' })).toBeDisplayed();
  const row = role('button', { name: 'Deselect renamed_pages' });
  await hover(row);
  await role('button', { name: 'Actions for renamed_pages' }, row).click();
  await role('menuitem', { name: 'Clone', exact: true }).click();
  await expect(role('button', { name: 'Select renamed_pages_copy', exact: true })).toBeDisplayed();
  await expect(testId('project-data-node-label')).toHaveText('renamed_pages');
  await role('button', { name: 'Help', exact: true }).click();
  await expect(role('dialog')).toBeDisplayed();
  await screenshot('/tmp/native-restored-help.png');
  await press('Escape');
  await screenshot('/tmp/native-restored-interactions.png');
});

it('native graph menus, preview switching and full exports reuse existing interactions', async () => {
  await browser.url('/');
  await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
  await post('/api/project/sql', {
    statements: [
      { sql: 'CREATE TABLE data.export_rows AS SELECT i::BIGINT x FROM range(55) t(i)' },
      { sql: 'CREATE TABLE data.second AS SELECT 99::BIGINT x' },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('export_rows'),('second')" },
    ],
  });
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await role('button', { name: 'Select export_rows', exact: true }).click();
  await testId('project-data-overlay').waitForStable();
  await role('button', { name: 'Sort by x' }).click();
  await role('button', { name: 'Sort by x' }).click();
  await expect(role('cell', { name: '54', exact: true })).toBeDisplayed();
  await role('button', { name: 'Select second', exact: true }).click();
  await expect(testId('project-data-node-label')).toHaveText('second');
  await role('button', { name: 'Close preview' }).click();
  await expect(testId('project-data-overlay')).not.toExist();
  await expect(role('button', { name: 'Deselect second', exact: true })).toBeDisplayed();
  await role('button', { name: 'Deselect second', exact: true }).click();
  await role('button', { name: 'Deselect export_rows', exact: true }).click();
  await role('button', { name: 'Select export_rows', exact: true }).click();
  await testId('project-data-overlay').waitForStable();
  await expect(role('cell', { name: '54', exact: true })).toBeDisplayed();
  // Reveal the lower graph cards by reducing the overlay, without moving the canvas.
  await press('End', role('separator', { name: 'Resize graph and data panels' }));
  const card = browser.$('[data-id=' + JSON.stringify('export_rows') + ']');
  await hover(card);
  const menu = role('button', { name: 'Data Block actions' });
  await menu.click();
  await role('menuitem', { name: 'Export', exact: true }).click();
  const dialog = role('dialog');
  await expect(dialog).toBeDisplayed();
  const path = `${outputDir}/downloads/export_rows.csv`;
  await rm(path, { force: true });
  await role('button', { name: 'Export', exact: true }, dialog).click();
  await browser.waitUntil(async () =>
    access(path).then(
      () => true,
      () => false,
    ),
  );
  expect((await readFile(path, 'utf8')).trim().split('\n')).toHaveLength(56);
  await expect(dialog).not.toExist();
  await role('button', { name: 'Delete (1)', exact: true }).click();
  await role('button', { name: /Delete/ }, role('alertdialog')).click();
  await expect(role('button', { name: 'Select export_rows', exact: true })).not.toExist();
  await expect(text('No Data Block Selected')).not.toExist();
  await expect(role('separator', { name: 'Resize graph and data panels' })).not.toExist();
});

for (const kind of ['table', 'view'] as const) {
  it(`native ${kind} datetime cast preserves offsets, fractions and nulls`, async () => {
    await browser.url('/');
    await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
    const seed = await post('/api/project/sql', {
      statements: [
        {
          sql: `CREATE ${kind.toUpperCase()} data.dates AS SELECT * FROM (VALUES ('2020-10-16 15:20:22.123456+05:30'), (NULL)) t(created_at)`,
        },
        {
          sql: "INSERT INTO wordflow.nodes(table_name, document_column) VALUES ('dates','created_at')",
        },
        { sql: "INSERT INTO wordflow.tokenizer_models VALUES ('dates','created_at','example')" },
        {
          sql: "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','dates',json_array('created_at'),'test.annotation','{}')",
        },
      ],
    });
    expect(seed.ok).toBe(true);
    await browser.refresh();
    await browser.$('[aria-label="Data Block graph"]').waitForExist();
    await role('button', { name: 'Select dates', exact: true }).click();
    await testId('project-data-overlay').waitForStable();
    await role('button', { name: 'Change data type for column created_at' }).click();
    await role('menuitem', { name: 'More SQL types…', exact: true }).click();
    const dialog = role('dialog', { name: 'Cast column' });
    await role('textbox', { name: 'SQL type' }, dialog).setValue('TIMESTAMPTZ');
    await role('button', { name: 'Cast', exact: true }, dialog).click();
    await expect(dialog).not.toExist();
    await expect(role('button', { name: 'Change data type for column created_at' })).toHaveText(
      expect.stringContaining('datetime'),
    );
    const checked = await post('/api/project/sql', {
      statements: [
        {
          sql: "SELECT CASE WHEN count(*)=2 AND count(created_at)=1 AND min(created_at)=TIMESTAMPTZ '2020-10-16 09:50:22.123456+00' THEN 1 ELSE error('Timestamp conversion changed values') END FROM data.dates",
        },
        {
          sql: "SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM wordflow.arrow_metadata WHERE relation_name='dates') AND NOT EXISTS (SELECT 1 FROM wordflow.tokenizer_models WHERE table_name='dates') AND (SELECT document_column FROM wordflow.nodes WHERE table_name='dates') IS NULL THEN 1 ELSE error('Cast retained incompatible column preferences') END",
        },
      ],
    });
    expect(checked.ok).toBe(true);
    if (kind === 'view') {
      await role('button', { name: 'Undo Data Block edit' }).click();
      await expect(role('button', { name: 'Change data type for column created_at' })).toHaveText(
        expect.stringContaining('string'),
      );
    } else {
      await expect(role('button', { name: 'Undo Data Block edit' })).toBeDisabled();
    }
  });
}

it('native datetime targets stay explicit and invalid casts report once', async () => {
  await post('/api/project/sql', {
    response: 'command',
    statements: [
      {
        sql: "CREATE TABLE data.cast_targets AS SELECT '2020-10-16T15:20:22.123456+05:30' AS stamp, 'invalid' AS broken",
      },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('cast_targets')" },
    ],
  });
  await browser.url('/');
  await role('button', { name: 'Select cast_targets', exact: true }).click();
  const header = role('button', { name: 'Change data type for column stamp' });
  await header.click();
  await role('menuitemradio', { name: 'datetime', exact: true }).click();
  const dialog = role('dialog', { name: 'Convert stamp to datetime', exact: true });
  await expect(dialog).not.toExist();
  await expect(header).toHaveText(expect.stringContaining('datetime'));
  const check = await post('/api/project/sql', {
    statements: [
      {
        sql: "SELECT CASE WHEN typeof(stamp)='TIMESTAMP' AND stamp=TIMESTAMP '2020-10-16 15:20:22.123456' THEN 1 ELSE error('Wrong native target') END FROM data.cast_targets",
      },
    ],
  });
  expect(check.ok).toBe(true);
  await header.click();
  await expect(role('menuitemradio', { name: 'datetime with timezone', exact: true })).not.toExist();
  await role('menuitem', { name: 'More SQL types…', exact: true }).click();
  const typeDialog = role('dialog', { name: 'Cast column' });
  await role('textbox', { name: 'SQL type' }, typeDialog).setValue('TIMESTAMPTZ');
  await role('button', { name: 'Cast', exact: true }, typeDialog).click();
  await expect(typeDialog).not.toExist();
  await expect(header).toHaveText(expect.stringContaining('datetime with timezone'));
  expectAppError(/Could not parse string/);
  await role('button', { name: 'Change data type for column broken' }).click();
  await role('menuitemradio', { name: 'datetime', exact: true }).click();
  await role('textbox', { name: 'Datetime format' }, role('dialog', { name: 'Convert broken to datetime', exact: true })).setValue('%Y-%m-%d');
  await role(
    'button',
    { name: 'Convert', exact: true },
    role('dialog', { name: 'Convert broken to datetime', exact: true }),
  ).click();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await role('button', { name: 'Cancel', exact: true }, role('dialog', { name: 'Convert broken to datetime', exact: true })).click();
  await expect(role('button', { name: 'Change data type for column broken' })).toHaveText(
    expect.stringContaining('string'),
  );
});
