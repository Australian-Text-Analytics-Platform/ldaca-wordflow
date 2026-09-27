import {
  buildExpression,
  emptyVisualBuild,
} from '../src/features/tools/preprocessing/build/hooks/buildExpressionModel';
import { Field, Int64 } from 'apache-arrow';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, text, label, testId, placeholder, press, screenshot } from './fixtures';

import type { FilterCondition } from '../src/features/tools/preprocessing/types';
import * as api from '../src/features/project/api';
import { joinColumnMappings } from '../src/features/tools/preprocessing/join/columnMappings';
import {
  applyTransformation,
  applyFind,
  previewSql,
  type Transformation,
} from '../src/features/tools/preprocessing/projectPreprocessing';
import {
  bindInput,
  columnSelect,
  filterSelect,
  joinSelect,
  sampleSelect,
  stackSelect,
} from '../src/features/tools/preprocessing/sql';

const base = 'http://127.0.0.1:3212';
const seed = async () =>
  api.executeSql(base, [
    {
      sql: `CREATE TABLE data."source's table" AS SELECT i AS id, CASE WHEN i % 3 = 0 THEN NULL ELSE i END AS n, 'one two three' AS text, 9007199254740993::BIGINT AS huge, 123456789012345678.123456789::DECIMAL(30,9) AS exact FROM range(45) t(i)`,
    },
    { sql: `CREATE VIEW data.live AS SELECT * FROM data."source's table"` },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('source''s table'),('live')" },
    {
      sql: "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','source''s table',json_array('text'),'test.annotation','{\"note\":\"preserved\"}')",
    },
    {
      sql: "INSERT INTO wordflow.tokenizer_models VALUES ('source''s table','text','native:plain_words_en')",
    },
    { sql: "UPDATE wordflow.nodes SET document_column='text' WHERE table_name='source''s table'" },
  ], { all: true });
const single = (select: string): Transformation => ({
  select,
  currentInput: "source's table",
  mappings: [{ source: "source's table", column: 'text', output: 'text' }],
});
const scalar = async (select: string) =>
  (await api.querySql(base, [{ sql: select }])).get(0)?.toJSON() as Record<string, unknown>;

it('join metadata follows native merged keys and duplicate output names', async () => {
  await api.executeSql(base, [
    { sql: "CREATE TABLE data.jl AS SELECT 'left' AS id, 'L' AS label" },
    { sql: "CREATE TABLE data.jr AS SELECT 'right' AS id, 'R' AS label" },
    {
      sql: "INSERT INTO wordflow.nodes(table_name, document_column) VALUES ('jl','id'),('jr','id')",
    },
    {
      sql: `INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','jl',json_array('id'),'test.annotation','{"side":"left"}'),('data','jr',json_array('id'),'test.annotation','{"side":"right"}'),('data','jr',json_array('label'),'test.annotation','{"note":"right label"}')`,
    },
    {
      sql: "INSERT INTO wordflow.tokenizer_models VALUES ('jl','id','left_model'),('jr','id','right_model')",
    },
  ], { all: true });
  const columns = (source: string) =>
    ['id', 'label'].map((column) => ({ source, column, output: column }));
  const apply = async (kind: 'right' | 'full', name: string) => {
    const select = joinSelect('jl', 'jr', kind, 'id', 'id');
    const preview = await previewSql(base, select, 1, 10);
    expect(preview.columns).toEqual(['id', 'label', 'label_1']);
    await applyTransformation(
      base,
      {
        select,
        mappings: joinColumnMappings(
          columns('jl'),
          columns('jr'),
          kind,
          'id',
          'id',
          preview.columns,
        ),
      },
      name,
    );
    return scalar(
      `SELECT extension_metadata AS descriptor FROM wordflow.arrow_metadata WHERE relation_name='${name}' AND field_path=json_array('id')`,
    );
  };
  expect(await apply('right', 'right_join')).toEqual({ descriptor: '{"side":"right"}' });
  expect(
    await scalar(
      "SELECT tokenizer_model AS model FROM wordflow.tokenizer_models WHERE table_name='right_join' AND column_name='id'",
    ),
  ).toEqual({ model: 'right_model' });
  expect(
    await scalar(
      "SELECT extension_metadata AS descriptor FROM wordflow.arrow_metadata WHERE relation_name='right_join' AND field_path=json_array('label_1')",
    ),
  ).toEqual({ descriptor: '{"note":"right label"}' });
  expect(await apply('full', 'full_join')).toBeUndefined();
  expect(
    await scalar(
      "SELECT count(*)::INTEGER AS n FROM wordflow.tokenizer_models WHERE table_name='full_join'",
    ),
  ).toEqual({ n: 0 });
  await api.executeSql(base, [
    {
      sql: `UPDATE wordflow.arrow_metadata SET extension_metadata='{"side":"left"}' WHERE relation_name='jr' AND field_path=json_array('id')`,
    },
    {
      sql: "UPDATE wordflow.tokenizer_models SET tokenizer_model='left_model' WHERE table_name='jr'",
    },
  ], { all: true });
  expect(await apply('full', 'agreed_join')).toEqual({ descriptor: '{"side":"left"}' });
});

it('DuckDB preprocessing: new Views, NULLs, precision, propagation and rollback', async () => {
  await seed();
  const request = { conditions: [{ column: 'n', operator: 'gte' as const, value: '40' }] };
  const operation = single(filterSelect(request));
  const page = await previewSql(base, bindInput(operation.select, "source's table"), 1, 2);
  expect(page.pagination.has_next).toBe(true);
  expect(page.data[0]?.huge).toBe('9007199254740993');
  expect(page.data[0]?.exact).toBe('123456789012345678.123456789');
  await applyTransformation(base, operation, 'filtered');
  expect(await scalar('SELECT count(*)::INTEGER AS n FROM data.filtered')).toEqual({
    n: 4,
  });
  expect(
    await scalar("SELECT document_column AS c FROM wordflow.nodes WHERE table_name='filtered'"),
  ).toEqual({ c: 'text' });
  expect(
    await scalar(
      "SELECT count(*)::INTEGER AS n FROM wordflow.tokenizer_models WHERE table_name='filtered'",
    ),
  ).toEqual({ n: 1 });
  expect(
    await scalar("SELECT count(*)::INTEGER AS n FROM wordflow.edges WHERE target_name='filtered'"),
  ).toEqual({ n: 0 });
  const before = await api.graph(base);
  expect(before.edges.find((edge) => edge.target_name === 'filtered')?.dependency).toBe(true);
  await api.executeSql(base, [
    { sql: `INSERT INTO data."source's table" VALUES (100,100,'new',1,1)` },
  ], { all: true });
  expect(await scalar('SELECT count(*)::INTEGER AS n FROM data.filtered')).toEqual({
    n: 5,
  });
  await expect(applyTransformation(base, operation, 'filtered')).rejects.toThrow();
  await api.executeSql(base, [
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('atomic_failure')" },
  ], { all: true });
  await expect(applyTransformation(base, operation, 'atomic_failure')).rejects.toThrow();
  expect(
    await scalar(
      "SELECT count(*)::INTEGER AS n FROM duckdb_views() WHERE view_name='atomic_failure'",
    ),
  ).toEqual({ n: 0 });
  expect(await scalar(`SELECT count(*)::INTEGER AS n FROM data."source's table"`)).toEqual(
    { n: 46 },
  );
  expect((await api.graph(base)).nodes.some((node) => node.table_name.endsWith('_backing'))).toBe(
    false,
  );
});

it('DuckDB preprocessing: native Sample, Join, Stack, Find and Build', async () => {
  await seed();
  for (const sample of [
    { offset: 40 },
    { mode: 'random_sample' as const, sample_size: 5, random_seed: 0 },
    { mode: 'random_sample' as const, sample_size: 1000 },
    { mode: 'random_sample' as const, sample_size: 0.2 },
    { mode: 'shuffle' as const, random_seed: 0 },
  ]) {
    const result = await previewSql(
      base,
      bindInput(sampleSelect(sample), "source's table"),
      1,
      100,
    );
    expect(result.data.length).toBeGreaterThan(0);
  }
  const join = joinSelect("source's table", 'live', 'inner', 'id', 'id');
  const joined = await previewSql(base, join, 1, 3);
  expect(joined.columns).toContain('text_1');
  await applyTransformation(base, { select: join, mappings: [] }, 'joined');
  expect((await api.rowPage(base, 'joined', 1, 3, [])).columns).toEqual(joined.columns);
  for (const kind of ['left', 'right', 'full', 'semi', 'anti', 'cross'] as const)
    expect(
      (await previewSql(base, joinSelect("source's table", 'live', kind, 'id', 'n'), 1, 2)).columns
        .length,
    ).toBeGreaterThan(0);
  await api.executeSql(base, [
    { sql: 'CREATE TABLE data.different AS SELECT 1 AS id, TRUE AS extra' },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('different')" },
  ], { all: true });
  const stack = await previewSql(base, stackSelect(["source's table", 'different'], false), 1, 100);
  expect(stack.columns).toContain('extra');
  expect(stack.data).toHaveLength(46);
  expect((await previewSql(base, stackSelect(['live', 'live'], true), 1, 100)).data).toHaveLength(
    45,
  );
  let foundIndex = 0;
  for (const [request, expected] of [
    [
      { source_column: 'text', pattern: '\\w+', replacement: 'X', count: 'first' as const },
      'X two three',
    ],
    [{ source_column: 'text', pattern: '\\w+', replacement: 'X', count: 'all' as const }, 'X X X'],
    [
      {
        source_column: 'text',
        pattern: '\\w+',
        mode: 'extract' as const,
        count: 'first' as const,
        match_limit: 2,
        connector: '|',
      },
      'one|two',
    ],
  ] as const) {
    const name = `found_${String(foundIndex++)}`;
    await applyFind(
      base,
      { table_name: "source's table", kind: 'table' },
      { ...request, output_column: name },
      (await api.nodeSchema(base, "source's table")).map(({ name }) => name),
    );
    expect(
      await scalar(
        `SELECT ${api.identifier(name)} AS found FROM data."source's table" LIMIT 1`,
      ),
    ).toEqual({ found: expected });
  }
  const tokens = [
    {
      id: 'sum',
      kind: 'column' as const,
      column: 'n',
      operations: [
        {
          kind: 'sum' as const,
          arguments: {},
          summary: { kind: 'scalar' as const, source: ['data', "source's table"] },
        },
      ],
    },
  ];
  const buildColumns = [{ name: 'n', typeName: 'Int64', field: new Field('n', new Int64()) }];
  const expression = buildExpression({ ...emptyVisualBuild(), roots: tokens }, buildColumns);
  await applyTransformation(base, single(columnSelect('total', expression, [])), 'totals');
  expect(
    await scalar('SELECT count(DISTINCT total)::INTEGER AS n FROM data.totals'),
  ).toEqual({ n: 1 });
  expect(
    (await api.nodeSchema(base, "source's table")).some((column) =>
      ['found', 'total'].includes(column.name),
    ),
  ).toBe(false);
  const exact = await previewSql(
    base,
    bindInput(
      filterSelect({
        conditions: [{ column: 'exact', operator: 'eq', value: '123456789012345678.123456789' }],
      }),
      "source's table",
    ),
    1,
    1,
  );
  expect(exact.data).toHaveLength(1);
});

it('restored preprocessing keeps seven tabs, native previews and drafts', async () => {
  await seed();
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await expect(role('heading', { name: 'Data Preprocessing', exact: true })).toBeDisplayed();
  for (const title of ['Filter', 'Sample', 'Join', 'Stack', 'Find', 'Build', 'SQL'])
    await expect(role('tab', { name: title, exact: true })).toBeDisplayed();
  await role('tab', { name: 'SQL', exact: true }).click();
  const editor = role('tabpanel', { name: 'SQL', exact: true }).$('.cm-content');
  await editor.setValue('SELECT i, i * 2 AS doubled FROM range(25) t(i)');
  await role('button', { name: 'Run cell 1', exact: true }).click();
  await expect(role('columnheader', { name: /doubled/ })).toBeDisplayed();
  await role('button', { name: 'Data Loader', exact: true }).click();
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await expect(editor).toHaveText(expect.stringContaining('range(25)'));
  await expect(role('button', { name: 'Create Data Block', exact: true })).not.toExist();
  await screenshot('/tmp/wordflow-preprocessing-light.png');
});

it('graph double-click adds inputs only to the active preprocessing tool', async () => {
  await seed();
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  const source = browser.$('[data-id=' + JSON.stringify("source's table") + ']');
  const live = browser.$('[data-id=' + JSON.stringify('live') + ']');
  await expect(text('Preprocessing Inputs (0/1)', { exact: true })).toBeDisplayed();
  await browser.execute(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('[data-testid="project-data-overlay"]') ||
              node.querySelector('[data-testid="project-data-overlay"]'))
          )
            document.documentElement.setAttribute('data-unexpected-preview', 'true');
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await source.doubleClick();
  await expect(text('Preprocessing Inputs (1/1)', { exact: true })).toBeDisplayed();
  await expect(role('status', { name: /Carrying/ })).not.toExist();
  await role('tab', { name: 'Stack', exact: true }).click();
  await source.doubleClick();
  await live.doubleClick();
  await expect(text('Preprocessing Inputs (2/6)', { exact: true })).toBeDisplayed();
  await expect(testId('project-data-overlay')).not.toExist();
  await expect(browser.$('html')).not.toHaveAttribute('data-unexpected-preview');
  await expect(
    role('columnheader', { name: /^id/ }, role('tabpanel', { name: 'Stack', exact: true })),
  ).toBeDisplayed();
  await screenshot('/tmp/wordflow-double-click-inputs.png');
  await role('tab', { name: 'Filter', exact: true }).click();
  await expect(text('Preprocessing Inputs (1/1)', { exact: true })).toBeDisplayed();
  await role('button', { name: 'Data Loader', exact: true }).click();
  await live.doubleClick();
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await expect(text('Preprocessing Inputs (1/1)', { exact: true })).toBeDisplayed();
});

it('preprocessing preserves mapped metadata and uses native typed filtering', async () => {
  await seed();
  await api.executeSql(base, [
    { sql: "CREATE TYPE labels AS ENUM ('a', 'b', 'unused')" },
    {
      sql: `CREATE TABLE data.typed AS SELECT 'a'::labels AS category, ['one','two'] AS tags, [0.1,0.8]::DOUBLE[2] AS coverage, TIMESTAMP_NS '2026-09-12 10:11:12.123456789' AS moment UNION ALL SELECT NULL, NULL, NULL, NULL`,
    },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('typed')" },
    {
      sql: "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','typed',json_array('coverage'),'org.ldaca.wordflow.topic_coverage.v1','{}')",
    },
  ], { all: true });
  const { nodeSchema: sourceSchema } = await import('../src/features/project/api');
  const schema = await sourceSchema(base, 'typed');
  const filters: [string, FilterCondition['value'], FilterCondition['operator']][] = [
    ['category', ['a', null], 'in'],
    ['tags', ['two'], 'in'],
    ['coverage', { topic_id: 0, threshold: 0.7 }, 'gte'],
    ['moment', '2026-09-12 10:11:12.123456789', 'eq'],
  ];
  for (const [column, value, operator] of filters) {
    const select = filterSelect({
      conditions: [
        {
          column,
          value: structuredClone(value),
          operator,
          field: schema.find((field) => field.name === column)?.field,
        },
      ],
    });
    expect((await previewSql(base, bindInput(select, 'typed'), 1, 5)).data.length).toBe(
      column === 'category' ? 2 : 1,
    );
  }
  const empty = await previewSql(
    base,
    bindInput('SELECT * FROM __wf_current WHERE FALSE', 'typed'),
    1,
    10,
  );
  expect(empty.columns).toEqual(['category', 'tags', 'coverage', 'moment']);
  expect(empty.schema[0]?.field.type.toString()).toContain('Dictionary');
  expect(empty.data).toEqual([]);
  const mappings = ["source's table", 'live'].map((source) => ({
    source,
    column: 'text',
    output: 'text',
  }));
  await applyTransformation(
    base,
    {
      select: stackSelect(["source's table", 'live'], false),
      mappings,
    },
    'no_consensus',
  );
  expect(
    await scalar(
      "SELECT count(*)::INTEGER AS n FROM wordflow.arrow_metadata WHERE relation_name='no_consensus'",
    ),
  ).toEqual({ n: 0 });
  await api.executeSql(base, [
    {
      sql: "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) SELECT schema_name,'live',field_path,extension_name,extension_metadata FROM wordflow.arrow_metadata WHERE relation_name='source''s table'",
    },
    { sql: "INSERT INTO wordflow.tokenizer_models VALUES ('live','text','native:plain_words_en')" },
    { sql: "UPDATE wordflow.nodes SET document_column='text' WHERE table_name='live'" },
  ], { all: true });
  await applyTransformation(
    base,
    {
      select: stackSelect(["source's table", 'live'], false),
      mappings,
    },
    'consensus',
  );
  expect(
    await scalar(
      "SELECT count(*)::INTEGER AS n FROM wordflow.arrow_metadata WHERE relation_name='consensus'",
    ),
  ).toEqual({ n: 1 });
  expect(
    await scalar("SELECT document_column AS c FROM wordflow.nodes WHERE table_name='consensus'"),
  ).toEqual({ c: 'text' });
  const computed = {
    ...single(columnSelect('text', 'upper(text)', ['text'])),
    computedColumns: ['text'],
  };
  await applyTransformation(base, computed, 'uppercase');
  expect(
    await scalar(
      "SELECT count(*)::INTEGER AS n FROM wordflow.arrow_metadata WHERE relation_name='uppercase'",
    ),
  ).toEqual({ n: 0 });
  expect(
    await scalar("SELECT document_column AS c FROM wordflow.nodes WHERE table_name='uppercase'"),
  ).toEqual({ c: 'text' });
  expect(await scalar('SELECT text FROM data.live LIMIT 1')).toEqual({
    text: 'one two three',
  });
});

it('visual tools render with native inputs in light and dark narrow panes', async () => {
  await seed();
  const retiredRequests: string[] = [];
  await browser.sessionSubscribe({ events: ['network.beforeRequestSent'] });
  browser.on('network.beforeRequestSent', ({ request }) => {
    if (/\/api\/(?:workspaces|auth|data-root|tasks)/.test(request.url))
      retiredRequests.push(request.url);
  });
  await browser.setViewport({ width: 1200, height: 950 });
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', `${value}-2026`);
      document.documentElement.style.colorScheme = value;
    }, theme);
    for (const title of ['Filter', 'Sample', 'Join', 'Stack', 'Find', 'Build']) {
      await role('tab', { name: title, exact: true }).click();
      const pane = role('tabpanel', { name: title, exact: true });
      if (theme === 'light') {
        await role('button', { name: 'Add data block', exact: true }, pane).click();
        await role('button', { name: "source's table", exact: true }).click();
        await expect(browser.$('[data-slot="popover-content"]')).not.toExist();
        if (title === 'Join' || title === 'Stack') {
          await role('button', { name: 'Add data block', exact: true, index: -1 }, pane).click();
          await role('button', { name: 'live', exact: true }).click();
        }
        if (title === 'Join') {
          await role('combobox', { name: 'Left column:' }, pane).click();
          await role('option', { name: 'id', exact: true }).click();
        }
        if (title === 'Filter') {
          await role('combobox', { name: 'Filter column' }, pane).click();
          await role('searchbox', { name: 'Filter options' }).setValue('text');
          await press('Enter', role('searchbox', { name: 'Filter options' }));
          await placeholder('Enter value', {}, pane).setValue('one');
          await expect(
            role('button', { name: 'Create Data Block', exact: true }, pane),
          ).toBeEnabled();
        }
        if (title === 'Find') await label('Regex pattern', {}, pane).setValue('one');
        if (title === 'Build') {
          await role('button', { name: 'Add column id', exact: true }, pane).click();
        }
      }
      await expect(role('combobox', { name: 'Result type' }, pane)).not.toExist();
      await expect(role('combobox', { name: 'Apply result as' }, pane)).not.toExist();
      await expect(role('columnheader', {}, pane)).toHaveText(expect.stringContaining('id'));
      if (theme === 'light') {
        const before = (await api.graph(base)).nodes.map((node) => node.table_name);
        if (title === 'Find') {
          await expect(label('New Data Block name', {}, pane)).not.toExist();
          await role('button', { name: 'Apply', exact: true }, pane).click();
          await browser.waitUntil(
            async () =>
              (await scalar(`SELECT text FROM data."source's table" LIMIT 1`)).text ===
              ' two three',
          );
          expect((await api.graph(base)).nodes.map(({ table_name }) => table_name)).toEqual(before);
        } else {
          await role('button', { name: 'Create Data Block', exact: true }, pane).click();
          await browser.waitUntil(
            async () => (await api.graph(base)).nodes.length === before.length + 1,
          );
          const created = (await api.graph(base)).nodes.filter(
            (node) => !before.includes(node.table_name),
          );
          expect(created).toHaveLength(1);
          expect(created[0]?.kind).toBe('view');
        }
        expect(
          await scalar(`SELECT count(*)::INTEGER AS n FROM data."source's table"`),
        ).toEqual({ n: 45 });
        await expect(testId('project-data-overlay')).not.toExist();
      }
      await browser
        .action('pointer', { id: 'mouse' })
        .move({ x: Math.round(15), y: Math.round(15), duration: 0 })
        .perform(true);
      await screenshot(`/tmp/preprocessing-${theme}-${title.toLowerCase()}.png`);
    }
  }
  expect(retiredRequests).toEqual([]);
});

it('self-joins keep independent keys, canonical output metadata, and one calculated dependency', async () => {
  await seed();
  for (const [kind, leftKey, rightKey] of [
    ['inner', 'id', 'n'],
    ['cross', undefined, undefined],
  ] as const) {
    const source = "source's table";
    const select = joinSelect(source, source, kind, leftKey, rightKey);
    const preview = await previewSql(base, select, 1, 10);
    const sourceColumns = (await api.nodeSchema(base, source)).map(({ name }) => ({
      source,
      column: name,
      output: name,
    }));
    await applyTransformation(
      base,
      {
        select,
        mappings: joinColumnMappings(
          sourceColumns,
          sourceColumns,
          kind,
          leftKey,
          rightKey,
          preview.columns,
        ),
      },
      `self_${kind}`,
    );
    const graph = await api.graph(base);
    expect(graph.edges.filter((edge) => edge.target_name === `self_${kind}`)).toHaveLength(1);
    expect(
      await scalar(
        `SELECT extension_metadata AS d FROM wordflow.arrow_metadata WHERE relation_name='self_${kind}' AND field_path=json_array('text_1')`,
      ),
    ).toEqual({ d: '{"note":"preserved"}' });
  }
  await api.executeSql(base, [
    { sql: 'CREATE TABLE data.empty AS SELECT 1 AS id WHERE false' },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('empty')" },
  ], { all: true });
  for (const kind of ['view'] as const) {
    await applyTransformation(
      base,
      {
        select: joinSelect('empty', 'empty', 'inner', 'id', 'id'),
        mappings: [],
      },
      `empty_${kind}`,
    );
    expect(await scalar(`SELECT count(*)::INTEGER AS n FROM data.empty_${kind}`)).toEqual({
      n: 0,
    });
  }
});

it('Join graph carrying targets separate roles for the same Data Block', async () => {
  await seed();
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'Join', exact: true }).click();
  const pane = role('tabpanel', { name: 'Join', exact: true });
  const source = browser.$('[data-id=' + JSON.stringify("source's table") + ']');
  await source.doubleClick();
  await expect(role('status', { name: /Carrying/ })).toBeDisplayed();
  await role('button', { name: 'Add to Left input', exact: true }, pane).click();
  await source.doubleClick();
  await role('button', { name: 'Add to Right input', exact: true }, pane).click();
  await expect(text('Left input (1/1)', { exact: true }, pane)).toBeDisplayed();
  await expect(text('Right input (1/1)', { exact: true }, pane)).toBeDisplayed();
  await expect(testId('project-data-overlay')).not.toExist();
  await role('combobox', { name: 'Left column:' }, pane).click();
  await role('option', { name: 'id', exact: true }).click();
  await role('combobox', { name: 'Right column:' }, pane).click();
  await role('option', { name: 'n', exact: true }).click();
  await expect(role('combobox', { name: 'Left column:' }, pane)).toHaveText(
    expect.stringContaining('id'),
  );
  await expect(role('combobox', { name: 'Right column:' }, pane)).toHaveText(
    expect.stringContaining('n'),
  );
  await role('textbox', { name: 'New data block name', exact: true }, pane).setValue('self_roles');
  await role('button', { name: 'Create Data Block', exact: true }, pane).click();
  await expect(role('button', { name: 'Select self_roles', exact: true })).toBeDisplayed();
  await expect(testId('project-data-overlay')).not.toExist();
  const graph = await api.graph(base);
  expect(graph.edges.filter((edge) => edge.target_name === 'self_roles')).toHaveLength(1);
});

it('precise temporal Filter text survives shadcn calendar interaction in both themes', async () => {
  await api.executeSql(base, [
    {
      sql: "CREATE TABLE data.temporal AS SELECT TIMESTAMPTZ '2026-09-16 12:34:56.123456+10:30' AS stamp",
    },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('temporal')" },
  ], { all: true });
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  const pane = role('tabpanel', { name: 'Filter', exact: true });
  await role('button', { name: 'Add data block', exact: true }, pane).click();
  await role('button', { name: 'temporal', exact: true }).click();
  await role('combobox', { name: 'Filter column' }, pane).click();
  await role('searchbox', { name: 'Filter options' }).setValue('stamp');
  await press('Enter', role('searchbox', { name: 'Filter options' }));
  const value = role('textbox', { name: 'Temporal value', exact: true }, pane);
  await expect(value).not.toHaveValue(''); // Wait for the retained automatic statistics prefill.
  const exact = '2026-09-16T12:34:56.123456+10:30';
  for (const theme of ['light', 'dark']) {
    await browser.execute((theme) => {
      document.documentElement.setAttribute('data-theme', `${theme}-2026`);
    }, theme);
    await value.setValue(exact);
    await role('button', { name: 'Choose date', exact: true }, pane).click();
    await expect(label('Time', { exact: true })).toHaveValue('12:34:56.123456');
    await screenshot(`/tmp/wordflow-temporal-${theme}.png`);
    await press('Escape');
    await expect(value).toHaveValue(exact);
    await role('button', { name: 'Choose date', exact: true }, pane).click();
    // Replace the controlled value through real keyboard input. WebDriver's
    // clear-element command can restore React's old value before appending text.
    await press('ControlOrMeta+a', label('Time', { exact: true }));
    await browser.keys('13:14:15.123456789');
    await expect(label('Time', { exact: true })).toHaveValue('13:14:15.123456789');
    await press('Escape');
    await expect(value).toHaveValue('2026-09-16T13:14:15.123456789+10:30');
  }
});
