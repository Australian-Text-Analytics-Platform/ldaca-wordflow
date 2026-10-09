import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import * as api from '@/features/project/api';
import { identifier, relation } from '@/features/project/objects';
import { compileEditor, initialEditorDraft, type EditorDraft, type EditorTool } from '../src/features/project/data-editor/expressions';
import { aggregateOperation, deduplicateOperations, groupCountSql, groupExpression, groupSelect } from '../src/features/tools/preprocessing/grouping/sql';
import { bindInput, filterSelect, joinSelect } from '../src/features/tools/preprocessing/sql';
import { applyTransformation, previewSql } from '../src/features/tools/preprocessing/projectPreprocessing';
import { baseUrl as base, label, role, testId, press, screenshot } from './fixtures';

const values = async (sql: string) => Array.from(await api.querySql(base, [{ sql }]), row => row.toJSON() as Record<string, unknown>);
async function seed() {
  await api.runSqlScript(base, `CREATE TABLE data.source(id BIGINT, body VARCHAR, xml VARCHAR, category VARCHAR, exact DECIMAL(30,8), stamp TIMESTAMP_NS, nested STRUCT(flag BOOLEAN, words VARCHAR[]));
    INSERT INTO data.source VALUES
    (1, 'cat.cat 猫咪 O''NEILL', '<r>A &amp; <![CDATA[<B>]]></r>', 'A', 1.12345678, '2026-01-01 23:59:59.999999999', {'flag':true,'words':['猫','dog']}),
    (2, 'a::b:c::d', '<r>broken', '', 2, '2026-01-02 00:00:00', NULL),
    (3, NULL, NULL, NULL, NULL, NULL, NULL),
    (4, 'cat.cat 猫咪 O''NEILL', '<r/>', '   ', 1.12345678, '2026-02-01 00:00:00', NULL),
    (5, 'CAT.cat 猫咪 O''NEILL', '<r>ok</r>', 'A', 5, '2026-02-02 00:00:00', NULL);
    CREATE VIEW data.live AS SELECT * FROM data.source;
    INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('source','body'),('live','body');
    INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','source','["nested","words"]','test.words','{"note":"nested"}');`, 'execute');
}
async function edit(tool: EditorTool, patch: Partial<EditorDraft>, source = 'source') {
  const columns = (await api.nodeSchema(base, source)).map(column => column.name);
  const operation = compileEditor(tool, { ...initialEditorDraft('body'), ...patch }, columns);
  const expected = await values(`SELECT to_json(row) AS exact FROM (${bindInput(operation.select, source)} ORDER BY id) row`);
  await api.changeColumn(base, source, operation.change);
  expect(await values(`SELECT to_json(row) AS exact FROM (SELECT * FROM ${relation({ table_name: source })} ORDER BY id) row`)).toEqual(expected);
}
it('Editor Preview and Apply agree for literal/regex/CJK matches, templates, counts, Split, XML and typed copies', async () => {
  await seed();
  await edit('replace', { pattern: '.', replacement: '$1', newColumn: true, output: 'literal' });
  expect((await values('SELECT literal FROM data.source WHERE id=1'))[0]?.literal).toBe("cat$1cat 猫咪 O'NEILL");
  await edit('replace', { pattern: '(cat)', replacement: '$1!', regex: true, first: true, newColumn: true, output: 'regex' });
  await edit('replace', { pattern: '猫', replacement: 'X', whole: true, newColumn: true, output: 'cjk' });
  expect((await values('SELECT cjk FROM data.source WHERE id=1'))[0]?.cjk).toContain('X咪');
  await edit('extract', { pattern: 'cat', connector: '|', sensitive: false, output: 'matches' });
  expect((await values('SELECT matches FROM data.source WHERE id=5'))[0]?.matches).toBe('CAT|cat');
  await edit('combine', { template: '{{{category}}}: {body}', missing: 'missing', output: 'combined' });
  expect((await values('SELECT combined FROM data.source WHERE id=3'))[0]?.combined).toBeNull();
  await edit('combine', { template: 'constant', output: 'constant' });
  await edit('split', { delimiters: [':', '::'], right: true, parts: 3 });
  expect(await values('SELECT body_1,body_2,body_3 FROM data.source WHERE id=2')).toEqual([{ body_1: 'a::b', body_2: 'c', body_3: 'd' }]);
  for (const measure of ['words','characters','non_whitespace','matches'] as const) {
    const output = `count_${measure}`;
    await edit('count', { measure, pattern: 'cat', output });
    expect((await values(`SELECT ${identifier(output)} FROM data.source WHERE id=3`))[0]?.[output]).toBeNull();
    expect((await values(`SELECT typeof(${identifier(output)}) AS kind FROM data.source LIMIT 1`))[0]?.kind).toBe('BIGINT');
  }
  await edit('clean', { column: 'xml', clean: 'xml', newColumn: true, output: 'clean_xml' });
  expect(await values('SELECT clean_xml FROM data.source WHERE id<=2 ORDER BY id')).toEqual([{ clean_xml: 'A & <B>' }, { clean_xml: '<r>broken' }]);
  await edit('clean', { clean: 'title', newColumn: true, output: 'title' });
  expect((await values('SELECT title FROM data.source WHERE id=1'))[0]?.title).toContain("O'neill");
  await edit('duplicate', { column: 'nested', output: 'nested copy' });
  expect(await values(`SELECT field_path FROM wordflow.arrow_metadata WHERE relation_name='source' ORDER BY field_path`)).toEqual([{ field_path: '["nested copy","words"]' }, { field_path: '["nested","words"]' }]);
  await edit('duplicate', { column: 'exact', output: 'exact copy' });
  expect((await values('SELECT typeof("exact copy") AS kind FROM data.source LIMIT 1'))[0]?.kind).toBe('DECIMAL(30,8)');
  await api.runSqlScript(base, "CREATE TABLE data.empty AS SELECT * FROM data.source LIMIT 0; INSERT INTO wordflow.nodes(table_name) VALUES ('empty')", 'execute');
  await edit('combine', { template: 'fixed', output: 'fixed' }, 'empty');
  expect((await values('SELECT count(*) AS n FROM data.empty'))[0]?.n).toBe(0n);
});
it('View edits stay live, multi-delete has one Undo, and failed Table batches leave no partial changes', async () => {
  await seed(); await edit('clean', { clean: 'upper' }, 'live');
  await api.runSqlScript(base, "UPDATE data.source SET body='later' WHERE id=1", 'execute');
  expect((await values('SELECT body FROM data.live WHERE id=1'))[0]?.body).toBe('LATER');
  const columns = (await api.nodeSchema(base, 'live')).map(column => column.name);
  await api.changeColumn(base, 'live', compileEditor('delete', { ...initialEditorDraft('body'), deleted: ['xml','category'] }, columns).change);
  expect((await api.nodeSchema(base, 'live')).map(column => column.name)).not.toContain('xml');
  await api.undoNode(base, 'live');
  expect((await api.nodeSchema(base, 'live')).map(column => column.name)).toContain('xml');
  await expect(api.changeColumn(base, 'source', { operation: 'transform_many', columns: [{ column: 'new', expression: 'length(body)', replace: false }, { column: 'id', expression: 'CAST(body AS BIGINT)', replace: true }] })).rejects.toThrow(/Conversion Error/);
  expect((await api.nodeSchema(base, 'source')).map(column => column.name)).not.toContain('new');
  await expect(api.changeColumn(base, 'source', { operation: 'delete_many', columns: ['xml','missing'] })).rejects.toThrow();
  expect((await api.nodeSchema(base, 'source')).map(column => column.name)).toContain('xml');
});
it('Group, Aggregate and Deduplicate create atomic live Views with exact filters and deterministic join names', async () => {
  await seed(); const columns = await api.nodeSchema(base, 'source');
  const dates = groupExpression('stamp', { kind: 'dates', period: 'month' }, columns.find(column => column.name === 'stamp')!.field);
  expect((await values(groupCountSql('source', dates))).map(row => row.rows)).toEqual(['2','2','1']);
  const grouping = { kind: 'ranges' as const, start: '0', width: '2' };
  const ranges = groupExpression('id', grouping, columns[0]!.field);
  const rangeCounts = await values(groupCountSql('source', ranges, grouping));
  expect(rangeCounts.map(row => row.rows)).toEqual(['2','2','1']);
  expect(rangeCounts[0]?.label).toMatch(/≤ value </);
  const expression = groupExpression('category', { kind: 'values' }, columns.find(column => column.name === 'category')!.field);
  const counts = await values(groupCountSql('source', expression));
  expect(counts).toEqual([{ value: null, label: null, rows: '3' }, { value: 'A', label: 'A', rows: '2' }]);
  await api.createViews(base, counts.map((group, index) => ({ name: `group_${index}`, mappings: [], sql: groupSelect('source', expression, group.value as string | null) })));
  expect((await values('SELECT count(*) AS n FROM data.group_0'))[0]?.n).toBe(3n);
  await applyTransformation(base, aggregateOperation('source', columns, ['category'], { body: 'join_text', exact: 'count_distinct', stamp: 'earliest_latest' }, '|', { column: 'id', descending: true }), 'aggregated');
  expect((await values("SELECT \"body join text\" AS body, \"exact count distinct\" AS n FROM data.aggregated WHERE category='A'"))[0]).toEqual({ body: "CAT.cat 猫咪 O'NEILL|cat.cat 猫咪 O'NEILL", n: 2n });
  const pair = deduplicateOperations('source', columns, ['body'], { urls: true, punctuation: true, symbols: true, whitespace: true, ignoreCase: true });
  await api.createViews(base, [{ name: 'kept', sql: pair.kept.select, mappings: pair.kept.mappings }, { name: 'duplicates', sql: pair.duplicates.select, mappings: pair.duplicates.mappings }]);
  expect(await values('SELECT id,kept FROM data.duplicates ORDER BY id')).toEqual([{ id: 1n, kept: true }, { id: 4n, kept: false }, { id: 5n, kept: false }]);
  expect(await values('SELECT id FROM data.kept ORDER BY id')).toEqual([{ id: 1n },{ id: 2n },{ id: 3n }]);
  await expect(api.createViews(base, [{ name: 'partial', mappings: [], sql: 'SELECT * FROM data.source' }, { name: 'bad', mappings: [], sql: 'SELECT * FROM missing' }])).rejects.toThrow();
  expect((await api.graph(base)).nodes.map(node => node.table_name)).not.toContain('partial');
  for (const [condition, length] of [
    [{ column: 'stamp', operator: 'lte' as const, value: '2026-01-01', field: columns.find(column => column.name === 'stamp')!.field }, 1],
    [{ column: 'id', operator: 'between' as const, value: { start: '0', end: '1' }, field: columns[0]!.field }, 1],
    [{ column: 'category', operator: 'is_empty' as const, value: null, field: columns.find(column => column.name === 'category')!.field }, 3],
  ] as const) expect(await values(bindInput(filterSelect({ conditions: [condition] }), 'source'))).toHaveLength(length);
  const joined = await previewSql(base, joinSelect('source', 'source', 'left', 'id','id', columns.map(column => column.name), columns.map(column => column.name)), 1, 10);
  expect(joined.columns).toContain('body_source'); expect(joined.columns).not.toContain('id_source');
  await api.runSqlScript(base, "INSERT INTO data.source(id,body,category) VALUES (6,'later','A')", 'execute');
  expect((await values('SELECT count(*) AS n FROM data.group_1'))[0]?.n).toBe(3n);
  expect((await values('SELECT count(*) AS n FROM data.kept'))[0]?.n).toBe(4n);
});
it('Editor reports malformed XML beyond the displayed page and retains those rows', async () => {
  await api.runSqlScript(base, "CREATE TABLE data.xml_input AS SELECT id, CASE WHEN id=200 THEN '<r>broken' ELSE '<r>A &amp; B</r>' END AS body FROM range(201) t(id); INSERT INTO wordflow.nodes(table_name) VALUES ('xml_input')", 'execute');
  await browser.url('/'); await role('button', { name: 'Select xml_input', exact: true }).click();
  await expect(role('button', { name: 'Clean', exact: true })).toBeEnabled();
  await role('button', { name: 'Clean', exact: true }).click();
  const pane = role('region', { name: 'Data Editor', exact: true });
  await expect(pane).toBeDisplayed();
  await label('Editor column', {}, pane).selectByVisibleText('body');
  await label('Cleaning', {}, pane).selectByVisibleText('Remove XML markup');
  await browser.waitUntil(async () => (await pane.getText()).includes('200 of 201 rows affected. 1 malformed XML rows retained.'));
  await label('Show malformed XML rows only', {}, pane).click();
  await browser.waitUntil(async () => (await testId('project-data-overlay').getText()).includes('<r>broken') && !(await testId('project-data-overlay').getText()).includes('A & B'));
  await role('button', { name: 'Apply', exact: true }, pane).click(); await expect(pane).not.toExist();
  expect((await values('SELECT body FROM data.xml_input WHERE id=200'))[0]?.body).toBe('<r>broken');
  expect((await values('SELECT count(*) AS n FROM data.xml_input WHERE body=\'A & B\''))[0]?.n).toBe(200n);
});
it('Editor UI preserves typing and failed drafts, closes after Apply, and has a collapsible Data View in both themes', async () => {
  await api.runSqlScript(base, "CREATE TABLE data.editor_input AS SELECT 'abc123 猫咪' AS body; INSERT INTO wordflow.nodes(table_name) VALUES ('editor_input')", 'execute');
  await browser.url('/'); await role('button', { name: 'Select editor_input', exact: true }).click();
  await expect(role('button', { name: 'Find/Replace', exact: true })).toBeEnabled();
  await role('button', { name: 'Find/Replace', exact: true }).click();
  let pane = role('region', { name: 'Data Editor', exact: true });
  await expect(pane).toBeDisplayed();
  await label('Find text', {}, pane).setValue('123'); await label('Replace with', {}, pane).setValue('$1');
  await label('Write to a new column', {}, pane).click(); await label('New column name', {}, pane).click(); await press('Tab');
  await expect(label('New column name', {}, pane)).toHaveValue('body replaced');
  expect(await browser.execute(() => document.activeElement?.getAttribute('placeholder'))).toBe('body replaced');
  await browser.waitUntil(async () => (await testId('project-data-overlay').getText()).includes('abc$1 猫咪'));
  await role('button', { name: 'Apply', exact: true }, pane).click(); await expect(pane).not.toExist();
  await expect(role('cell', { name: 'abc$1 猫咪', exact: true }, testId('project-data-overlay'))).toBeDisplayed();
  await role('button', { name: 'Find/Replace', exact: true }).click();
  pane = role('region', { name: 'Data Editor', exact: true });
  await expect(pane).toBeDisplayed(); await label('Regex', {}, pane).click();
  expectAppError(/regex parse error|unclosed character class/i, 3);
  await label('Pattern', {}, pane).setValue('[');
  await browser.waitUntil(async () => (await pane.getText()).includes("Couldn't preview edit"));
  await role('button', { name: 'Apply', exact: true }, pane).click();
  await browser.waitUntil(async () => (await pane.getText()).includes("Couldn't apply edit"));
  await expect(label('Pattern', {}, pane)).toHaveValue('['); await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(0);
  await label('Pattern', {}, pane).setValue('abc'); await role('button', { name: 'Apply', exact: true }, pane).click(); await expect(pane).not.toExist();
  await role('button', { name: 'Count', exact: true }).click();
  pane = role('region', { name: 'Data Editor', exact: true });
  await expect(pane).toBeDisplayed();
  for (const theme of ['light','dark']) {
    await browser.execute(value => { document.documentElement.dataset.theme = `${value}-2026`; document.documentElement.style.colorScheme = value; }, theme);
    await browser.setViewport({ width: 1000, height: 760 }); await expect(pane).toBeDisplayed(); await screenshot(`/tmp/editor-${theme}.png`);
  }
  await role('button', { name: 'Data View', exact: true }).click(); await expect(testId('project-data-overlay')).not.toBeDisplayed();
  await role('button', { name: 'Data View', exact: true }).click(); await expect(testId('project-data-overlay')).toBeDisplayed();
  await role('button', { name: 'Cancel', exact: true }, pane).click(); expect((await api.graph(base)).nodes).toHaveLength(1);
});
