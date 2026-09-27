import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import * as api from '../src/features/project/api';
import { applyFind } from '../src/features/tools/preprocessing/projectPreprocessing';
import type { ReplaceRequest } from '../src/features/tools/preprocessing/replace/hooks/replaceRequestModel';
import { baseUrl as base, label, role, testId } from './fixtures';

const values = async (sql: string) =>
  Array.from(
    await api.querySql(base, [{ sql }]),
    (row: { toJSON: () => Record<string, unknown> }) => row.toJSON(),
  );
const apply = async (name: string, kind: 'table' | 'view', request: ReplaceRequest) =>
  applyFind(
    base,
    { table_name: name, kind },
    request,
    (await api.nodeSchema(base, name)).map(({ name }) => name),
  );

it('Find changes stored columns atomically with native assignment, constraints and metadata', async () => {
  const name = "Find's Table";
  const relation = api.relation({ table_name: name });
  await api.executeSql(base, [
    {
      sql: `CREATE TABLE ${relation} ("Body ""Text" VARCHAR, "Other" VARCHAR, amount INTEGER CHECK(amount >= 0), keep BIGINT)`,
    },
    {
      sql: `INSERT INTO ${relation} VALUES ('a1 b2','old',7,9007199254740993),(NULL,'untouched',8,9007199254740995)`,
    },
    {
      sql: 'INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?)',
      parameters: [name, 'Other'],
    },
    {
      sql: `INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data',?,json_array(?),'test.annotation','{"note":"original"}')`,
      parameters: [name, 'Other'],
    },
    {
      sql: 'INSERT INTO wordflow.tokenizer_models VALUES (?,?,?)',
      parameters: [name, 'Other', 'native:plain_words_en'],
    },
  ], { all: true });
  const before = await api.graph(base);
  const source_column = 'Body "Text';
  await apply(name, 'table', {
    source_column,
    pattern: '\\d+',
    mode: 'extract',
    connector: '|',
    output_column: 'Found "digits',
  });
  expect(
    await values(`SELECT "Found ""digits" AS result FROM ${relation} ORDER BY amount`),
  ).toEqual([{ result: '1|2' }, { result: null }]);
  await apply(name, 'table', {
    source_column,
    pattern: '\\d+',
    replacement: '#',
    count: 'first',
    output_column: 'oTHER',
  });
  expect(
    await values(
      `SELECT "Other" AS result, keep::VARCHAR AS keep FROM ${relation} ORDER BY amount`,
    ),
  ).toEqual([
    { result: 'a# b2', keep: '9007199254740993' },
    { result: null, keep: '9007199254740995' },
  ]);
  expect((await api.nodeSchema(base, name)).map(({ name }) => name)).toEqual([
    source_column,
    'Other',
    'amount',
    'keep',
    'Found "digits',
  ]);
  expect(await values('SELECT * FROM wordflow.arrow_metadata')).toEqual([]);
  expect((await api.graph(base)).nodes[0]?.document_column).toBe('Other');
  expect(await values('SELECT column_name FROM wordflow.tokenizer_models')).toEqual([
    { column_name: 'Other' },
  ]);

  const contents = await values(`SELECT * EXCLUDE (keep) FROM ${relation} ORDER BY amount`);
  await expect(
    apply(name, 'table', { source_column, pattern: '[', output_column: 'failed_column' }),
  ).rejects.toThrow();
  expect((await api.nodeSchema(base, name)).some(({ name }) => name === 'failed_column')).toBe(
    false,
  );
  await expect(
    apply(name, 'table', {
      source_column,
      pattern: 'a',
      replacement: 'z',
      output_column: 'amount',
    }),
  ).rejects.toThrow();
  await expect(
    apply(name, 'table', {
      source_column,
      pattern: '.+',
      replacement: '-1',
      output_column: 'amount',
    }),
  ).rejects.toThrow(/constraint/i);
  expect(await values(`SELECT * EXCLUDE (keep) FROM ${relation} ORDER BY amount`)).toEqual(
    contents,
  );

  await apply(name, 'table', {
    source_column,
    pattern: '\\d',
    replacement: '#',
    output_column: '',
  });
  expect(await values(`SELECT "Body ""Text" AS result FROM ${relation} ORDER BY amount`)).toEqual([
    { result: 'a# b#' },
    { result: null },
  ]);
  const after = await api.graph(base);
  expect(after.nodes.map(({ table_name }) => table_name)).toEqual(
    before.nodes.map(({ table_name }) => table_name),
  );
  expect(after.nodes[0]?.can_undo).toBe(false);
  expect(after.edges).toEqual(before.edges);
  expect(
    await values("SELECT table_name FROM duckdb_tables() WHERE schema_name='data'"),
  ).toEqual([{ table_name: name }]);
});

it('Find layers live View expressions, preserves identity and supports repeated Undo', async () => {
  await api.executeSql(base, [
    {
      sql: "CREATE TABLE data.raw AS SELECT * FROM (VALUES (1,'a1 b2'),(2,NULL)) t(id,Body)",
    },
    { sql: 'CREATE VIEW data.live AS SELECT * FROM data.raw' },
    {
      sql: "INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('raw','Body'),('live','Body')",
    },
    { sql: "INSERT INTO wordflow.edges VALUES ('raw','live')" },
    {
      sql: `INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','live',json_array('Body'),'test.annotation','{"note":"original"}')`,
    },
    { sql: "INSERT INTO wordflow.tokenizer_models VALUES ('live','Body','native:plain_words_en')" },
  ], { all: true });
  const before = await api.graph(base);
  await apply('live', 'view', {
    source_column: 'Body',
    pattern: '\\d',
    mode: 'extract',
    count: 'first',
    match_limit: 1,
    connector: '|',
    output_column: 'Found',
  });
  expect(await values('SELECT "Found" FROM data.live ORDER BY id')).toEqual([
    { Found: '1' },
    { Found: null },
  ]);
  await api.executeSql(base, [{ sql: "UPDATE data.raw SET Body='c3 d4' WHERE id=1" }], { all: true });
  expect(await values('SELECT "Found" FROM data.live ORDER BY id')).toEqual([
    { Found: '3' },
    { Found: null },
  ]);
  await apply('live', 'view', {
    source_column: 'Found',
    pattern: '\\d',
    replacement: '#',
    output_column: 'fOUND',
  });
  expect(await values('SELECT "Found" FROM data.live ORDER BY id')).toEqual([
    { Found: '#' },
    { Found: null },
  ]);
  await api.undoNode(base, 'live');
  expect(await values('SELECT "Found" FROM data.live ORDER BY id')).toEqual([
    { Found: '3' },
    { Found: null },
  ]);
  await api.undoNode(base, 'live');
  expect((await api.nodeSchema(base, 'live')).map(({ name }) => name)).toEqual(['id', 'Body']);
  await apply('live', 'view', {
    source_column: 'Body',
    pattern: '\\d',
    replacement: '#',
    output_column: '',
  });
  expect(await values('SELECT Body FROM data.live ORDER BY id')).toEqual([
    { Body: 'c# d#' },
    { Body: null },
  ]);
  expect(await values('SELECT Body FROM data.raw WHERE id=1')).toEqual([
    { Body: 'c3 d4' },
  ]);
  expect(await values("SELECT * FROM wordflow.arrow_metadata WHERE relation_name='live'")).toEqual(
    [],
  );
  expect(
    await values("SELECT column_name FROM wordflow.tokenizer_models WHERE table_name='live'"),
  ).toEqual([{ column_name: 'Body' }]);
  const after = await api.graph(base);
  expect(after.nodes.map(({ table_name }) => table_name)).toEqual(
    before.nodes.map(({ table_name }) => table_name),
  );
  expect(after.edges).toEqual(before.edges);
  expect(after.nodes.find(({ table_name }) => table_name === 'live')?.can_undo).toBe(true);
  expect(
    await values("SELECT view_name FROM duckdb_views() WHERE schema_name='data'"),
  ).toEqual([{ view_name: 'live' }]);
});

it('Find adds text columns to empty Tables and Views without creating Data Blocks', async () => {
  await api.executeSql(base, [
    { sql: 'CREATE TABLE data.empty_table (text VARCHAR)' },
    { sql: 'CREATE VIEW data.empty_view AS SELECT text FROM data.empty_table' },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('empty_table'),('empty_view')" },
  ], { all: true });
  for (const kind of ['table', 'view'] as const) {
    const name = `empty_${kind}`;
    await apply(name, kind, {
      source_column: 'text',
      pattern: '\\w+',
      replacement: '#',
      output_column: 'added',
    });
    expect(
      (await api.nodeSchema(base, name)).map(({ name, field }) => [name, String(field.type)]),
    ).toEqual([
      ['text', 'Utf8'],
      ['added', 'Utf8'],
    ]);
    expect((await api.rowPage(base, name, 1, 10, [])).rows).toEqual([]);
  }
  expect((await api.graph(base)).nodes).toHaveLength(2);
});

it('Find UI applies in place and refreshes an open preview without changing selection', async () => {
  await api.executeSql(base, [
    { sql: "CREATE TABLE data.find_input AS SELECT 'abc123' AS text" },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('find_input')" },
  ], { all: true });
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'Find', exact: true }).click();
  const pane = role('tabpanel', { name: 'Find', exact: true });
  await role('button', { name: 'Add data block', exact: true }, pane).click();
  await role('button', { name: 'find_input', exact: true }).click();
  await label('Regex pattern', {}, pane).setValue('\\d+');
  await label('Replacement', {}, pane).setValue('#');
  await label('Output column name', {}, pane).setValue('found');
  await role('button', { name: 'Apply', exact: true }, pane).click();
  await browser.waitUntil(async () =>
    (await api.nodeSchema(base, 'find_input')).some(({ name }) => name === 'found'),
  );
  await expect(testId('project-data-overlay')).not.toExist();
  expect((await api.graph(base)).nodes).toHaveLength(1);
  // Sidebar selection opens this preview independently from Find's inputs.
  await role('button', { name: 'Select find_input', exact: true }).click();
  await expect(testId('project-data-overlay')).toBeDisplayed();
  await expect(
    role('cell', { name: 'abc#', exact: true }, testId('project-data-overlay')),
  ).toBeDisplayed();
  await label('Replacement', {}, pane).setValue('!');
  await role('button', { name: 'Apply', exact: true }, pane).click();
  await expect(
    role('cell', { name: 'abc!', exact: true }, testId('project-data-overlay')),
  ).toBeDisplayed();
  await expect(label('Output column name', {}, pane)).toHaveValue('found');
  expectAppError(/missing.*\]|invalid.*regular/i, 2);
  await label('Regex pattern', {}, pane).setValue('[');
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await role('button', { name: 'Apply', exact: true }, pane).click();
  await expect(browser.$('[data-sonner-toast]')).toHaveText(
    expect.stringContaining('Preprocessing failed'),
  );
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(label('Regex pattern', {}, pane)).toHaveValue('[');
  await expect(
    role('cell', { name: 'abc!', exact: true }, testId('project-data-overlay')),
  ).toBeDisplayed();
});
