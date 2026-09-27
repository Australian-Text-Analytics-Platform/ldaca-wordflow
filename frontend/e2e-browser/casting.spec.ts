import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl, post, role, testId } from './fixtures';

async function sql(statements: string[]) {
  const response = await post('/api/project/sql', {
    statements: statements.map((sql) => ({ sql })),
    response: 'command',
  });
  if (!response.ok) throw new Error(await response.text());
}
async function cast(column: string, target: string) {
  await role('button', { name: `Change data type for column ${column}`, exact: true }).click();
  await role('menuitem', { name: 'More SQL types…', exact: true }).click();
  const dialog = role('dialog', { name: 'Cast column' });
  await role('textbox', { name: 'SQL type' }, dialog).setValue(target);
  await role('button', { name: 'Cast', exact: true }, dialog).click();
  await expect(dialog).not.toExist();
}

it('loads catalogue types and aliases, ranks common names, and discovers new named types on reopening', async () => {
  await sql([
    `CREATE TABLE data.catalogue_cast AS SELECT 'calm' AS mood`,
    `INSERT INTO wordflow.nodes(table_name) VALUES ('catalogue_cast')`,
    `CREATE SCHEMA "Type schema"`,
    `CREATE TYPE "Type schema"."Mood ""kind""" AS ENUM ('calm', 'busy')`,
    `COMMENT ON TYPE "Type schema"."Mood ""kind""" IS 'User mood categories'`,
    `CREATE TYPE wordflow.enum_0123456789abcdef0123456789abcdef AS ENUM ('calm')`,
    `CREATE TYPE "Type schema".enum_0123456789abcdef0123456789abcdef AS ENUM ('calm')`,
    `CREATE TYPE wordflow.enum_mood AS ENUM ('calm')`,
  ]);
  await browser.url('/');
  await role('button', { name: 'Select catalogue_cast', exact: true }).click();
  await testId('project-data-overlay').waitForStable();
  await role('button', { name: 'Change data type for column mood', exact: true }).click();
  await role('menuitem', { name: 'More SQL types…', exact: true }).click();
  const dialog = role('dialog', { name: 'Cast column' });
  const input = role('textbox', { name: 'SQL type' }, dialog);
  const recommended = role('region', { name: 'Recommended types' }, dialog);
  await expect(role('button', { name: 'Use VARCHAR', exact: true }, recommended)).toBeDisplayed();
  await input.setValue('enum_');
  await expect(
    role(
      'button',
      { name: 'Use "wordflow"."enum_0123456789abcdef0123456789abcdef"', exact: true },
      dialog,
    ),
  ).not.toExist();
  await expect(
    role(
      'button',
      { name: 'Use "Type schema"."enum_0123456789abcdef0123456789abcdef"', exact: true },
      dialog,
    ),
  ).toBeDisplayed();
  await expect(
    role('button', { name: 'Use "wordflow"."enum_mood"', exact: true }, dialog),
  ).toBeDisplayed();
  await sql([
    `SELECT CASE WHEN count(*)=1 THEN 1 ELSE error('Generated type was deleted') END FROM duckdb_types() WHERE schema_name='wordflow' AND type_name='enum_0123456789abcdef0123456789abcdef'`,
  ]);
  // These types and aliases were absent from the old hand-maintained catalogue.
  for (const type of ['TIMETZ', 'TIME_NS', 'VARIANT', 'INT128', 'NVARCHAR']) {
    await input.setValue(type);
    await expect(role('button', { name: `Use ${type}`, exact: true }, dialog)).toBeDisplayed();
  }
  await input.setValue('categories');
  await role('button', { name: 'Use "Type schema"."Mood ""kind"""', exact: true }, dialog).click();
  await expect(input).toHaveValue('"Type schema"."Mood ""kind"""');
  await sql([
    `SELECT CASE WHEN typeof(mood)='VARCHAR' THEN 1 ELSE error('Selecting a type performed a cast') END FROM catalogue_cast`,
  ]);
  await role('button', { name: 'Cast', exact: true }, dialog).click();
  await expect(dialog).not.toExist();
  await sql([
    `SELECT CASE WHEN typeof(mood) LIKE 'ENUM%' AND mood='calm' THEN 1 ELSE error('Named cast failed') END FROM catalogue_cast`,
  ]);
  await sql([`CREATE TYPE wordflow.newly_created AS ENUM ('calm')`]);
  await role('button', { name: 'Change data type for column mood', exact: true }).click();
  await role('menuitem', { name: 'More SQL types…', exact: true }).click();
  const reopened = role('dialog', { name: 'Cast column' });
  await role('textbox', { name: 'SQL type' }, reopened).setValue('newly_created');
  await expect(
    role('button', { name: 'Use "wordflow"."newly_created"', exact: true }, reopened),
  ).toBeDisplayed();
  await role('button', { name: 'Cancel', exact: true }, reopened).click();
});

for (const kind of ['table', 'view']) {
  it(`casts SQL types in a real ${kind}, preserving values and applicable metadata`, async () => {
    await sql([
      `CREATE TYPE wordflow.cast_mood_${kind} AS ENUM ('calm', 'busy')`,
      `CREATE ${kind} data."Cast data" AS SELECT * FROM (VALUES ('12345678901234567890.123456789', '[1,2]', 'calm'), (NULL,NULL,NULL)) t("amount ""value""", items, document)`,
      `CREATE ${kind} data.empty_cast AS SELECT NULL::VARCHAR AS items WHERE false`,
      `INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('Cast data','document'), ('empty_cast', NULL)`,
      `INSERT INTO wordflow.tokenizer_models VALUES ('Cast data','document','example')`,
      `INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','Cast data',json_array('document'),'test.annotation','{}'), ('data','Cast data',json_array('items'),'test.annotation','{}')`,
    ]);
    await browser.url('/');
    await role('button', { name: 'Select Cast data', exact: true }).click();
    await testId('project-data-overlay').waitForStable();
    await cast('document', 'TEXT');
    await sql([
      `SELECT CASE WHEN (SELECT count(*) FROM wordflow.arrow_metadata WHERE relation_name='Cast data' AND field_path=json_array('document'))=1 AND (SELECT count(*) FROM wordflow.tokenizer_models WHERE table_name='Cast data')=1 THEN 1 ELSE error('Text alias lost metadata') END`,
    ]);
    await cast('document', `wordflow.cast_mood_${kind}`);
    await cast('amount "value"', 'DECIMAL(38,9)');
    await cast('items', 'INTEGER[]');
    await sql([
      `SELECT CASE WHEN typeof("amount ""value""")='DECIMAL(38,9)' AND CAST("amount ""value""" AS VARCHAR)='12345678901234567890.123456789' AND items=[1,2] AND document='calm' THEN 1 ELSE error('Cast changed exact values') END FROM data."Cast data" WHERE document IS NOT NULL`,
      `SELECT CASE WHEN count(*)=2 AND count(items)=1 THEN 1 ELSE error('Cast changed NULLs') END FROM data."Cast data"`,
      `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM wordflow.arrow_metadata WHERE relation_name='Cast data') AND (SELECT document_column FROM wordflow.nodes WHERE table_name='Cast data')='document' AND (SELECT count(*) FROM wordflow.tokenizer_models WHERE table_name='Cast data')=1 THEN 1 ELSE error('Cast metadata cleanup failed') END`,
    ]);
    if (kind === 'view') {
      await role('button', { name: 'Undo Data Block edit' }).click();
      await expect(role('button', { name: 'Change data type for column items' })).toHaveText(
        expect.stringContaining('string'),
      );
      await sql([
        `SELECT CASE WHEN typeof(items)='VARCHAR' AND items='[1,2]' THEN 1 ELSE error('Undo failed') END FROM data."Cast data" WHERE items IS NOT NULL`,
      ]);
    } else {
      await expect(role('button', { name: 'Undo Data Block edit' })).toBeDisabled();
    }
    await role('button', { name: 'Select empty_cast', exact: true }).click();
    await cast('items', 'STRUCT("a b" INTEGER)');
    await sql([
      `SELECT CASE WHEN (SELECT count(*) FROM data.empty_cast)=0 AND (SELECT data_type FROM duckdb_columns() WHERE schema_name='data' AND table_name='empty_cast' AND column_name='items')='STRUCT("a b" INTEGER)' THEN 1 ELSE error('Empty cast failed') END`,
    ]);
  });
}

it('rejects invalid types, extra SQL and incompatible values without altering the column', async () => {
  await sql([
    `CREATE TABLE data.invalid_cast AS SELECT 'broken' AS value`,
    `INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('invalid_cast','value')`,
    `INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','invalid_cast',json_array('value'),'test.annotation','{}')`,
  ]);
  await browser.url('/');
  await role('button', { name: 'Select invalid_cast', exact: true }).click();
  await testId('project-data-overlay').waitForStable();
  await role('button', { name: 'Change data type for column value' }).click();
  await role('menuitem', { name: 'More SQL types…' }).click();
  const dialog = role('dialog', { name: 'Cast column' });
  const input = role('textbox', { name: 'SQL type' }, dialog);
  for (const type of [
    'missing_type',
    'INTEGER',
    "VARCHAR) || nextval('missing') --",
    'VARCHAR); DROP TABLE data.invalid_cast; --',
  ]) {
    expectAppError(type === 'missing_type' ? /missing_type/ : type === 'INTEGER' ? /broken/ : /Enter one SQL type|Only SELECT statements can be serialized/i);
    await input.setValue(type);
    await role('button', { name: 'Cast', exact: true }, dialog).click();
    await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
    await expect(role('button', { name: 'Cast', exact: true }, dialog)).toBeDisplayed();
    await expect(input).toHaveValue(type);
    await browser.$('[data-sonner-toast] button[aria-label="Close toast"]').click();
  }
  await role('button', { name: 'Cancel', exact: true }, dialog).click();
  await sql([
    `SELECT CASE WHEN typeof(value)='VARCHAR' AND value='broken' THEN 1 ELSE error('Failed cast changed column') END FROM data.invalid_cast`,
    `SELECT CASE WHEN (SELECT count(*) FROM wordflow.arrow_metadata WHERE relation_name='invalid_cast')=1 AND (SELECT document_column FROM wordflow.nodes WHERE table_name='invalid_cast')='value' THEN 1 ELSE error('Failed cast lost metadata') END`,
  ]);
});

it('commits a lazy View cast and displays the conversion error from the refreshed page', async () => {
  await sql([
    `CREATE TABLE data.lazy_cast_source(created_at VARCHAR)`,
    `INSERT INTO data.lazy_cast_source VALUES ('2020-10-17 00:52:37.000 +0000')`,
    `CREATE VIEW data.lazy_cast AS SELECT * FROM data.lazy_cast_source`,
    `INSERT INTO wordflow.nodes(table_name) VALUES ('lazy_cast')`,
  ]);
  await browser.url('/');
  await role('button', { name: 'Select lazy_cast', exact: true }).click();
  const overlay = testId('project-data-overlay');
  await overlay.waitForStable();
  await expect(overlay).toHaveText(expect.stringContaining('2020-10-17'));
  expectAppError(/Conversion Error/);
  await cast('created_at', 'TIMESTAMP');
  await expect(browser.$('[data-sonner-toast]')).toHaveText(expect.stringContaining('Conversion Error'));
  await expect(role('alert', {}, overlay)).not.toExist();
  await browser.$('[data-sonner-toast] button[aria-label="Close toast"]').click();
  // The cast committed; Undo restores the previous definition and the page.
  await role('button', { name: 'Undo Data Block edit', exact: true }, overlay).click();
  await expect(role('alert', {}, overlay)).not.toExist();
  await expect(overlay).toHaveText(expect.stringContaining('2020-10-17'));
});

it('infers datetime offsets and requests manual formats only when needed', async () => {
  const { datetimeScenario } = await import('../e2e-native/scenarios/datetime');
  await browser.url('/');
  await datetimeScenario(baseUrl);
});
