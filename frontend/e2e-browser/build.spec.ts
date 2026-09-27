import { DataType } from 'apache-arrow';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, text, label, testId, testIds, rect, press, screenshot } from './fixtures';
import type { ChainablePromiseElement } from 'webdriverio';
import * as api from '../src/features/project/api';
import { decodeArrowData } from '../src/lib/arrow/decodeArrowTable';
import { mapArrowColumnsToInfo } from '../src/features/project/data-view/utils/columnTypes';
import { columnSelect, table } from '../src/features/tools/preprocessing/sql';
import {
  applyTransformation,
} from '../src/features/tools/preprocessing/projectPreprocessing';
import {
  operationKinds,
  operationDefinition,
  type BuildOperation,
} from '../src/features/tools/preprocessing/build/operations';
import {
  buildExpression as compile,
  emptyVisualBuild,
  type BuildVisualDefinition,
  type BuildCombinationKind,
  type BuildBuilderToken,
} from '../src/features/tools/preprocessing/build/hooks/buildExpressionModel';
import { parsedBuildExpression } from '../src/features/tools/preprocessing/build/parseBuildExpression';
const base = 'http://127.0.0.1:3212';
const node = 'build"source';
const op = (
  kind: BuildOperation['kind'],
  arguments_: BuildOperation['arguments'] = {},
): BuildOperation => ({ kind, arguments: arguments_ });
const token = (column: string, operations: BuildOperation[] = []): BuildBuilderToken => ({
  id: column,
  kind: 'column',
  column,
  operations,
});
const visual = (
  parts: BuildBuilderToken[],
  kind?: BuildCombinationKind,
): BuildVisualDefinition => ({
  ...emptyVisualBuild(),
  roots: kind
    ? [
        {
          id: 'root',
          kind: 'combination',
          combination: { kind, separator: '' },
          children: parts,
          operations: [],
        },
      ]
    : parts,
});
const buildExpression = (
  parts: BuildBuilderToken[],
  columns: ReturnType<typeof mapArrowColumnsToInfo>,
  source?: string,
  kind?: BuildCombinationKind,
) =>
  compile(
    visual(
      source
        ? parts.map((p) => ({
            ...p,
            operations: p.operations.map((o) =>
              operationDefinition(o.kind).summary
                ? { ...o, summary: { kind: 'scalar' as const, source: ['data', source] } }
                : o,
            ),
          }))
        : parts,
      kind,
    ),
    columns,
  );
async function seed() {
  await api.executeSql(base, [
    { sql: "CREATE TYPE data.build_category AS ENUM ('A','B','unused')" },
    {
      sql: `CREATE TABLE ${table(node)} AS SELECT ' Abç Abç ' AS txt, 4::DECIMAL(30,8) AS n, true AS b, DATE '2026-09-15' AS d, TIMESTAMP '2026-09-15 12:34:56.123456' AS ts, TIME '12:34:56.123456' AS tm, [3,NULL,1,3] AS nums, ['a',NULL,'b'] AS words, NULL::VARCHAR AS missing, 'A'::"data".build_category AS category, '2026-09-15 12:34:56.123456 +1000' AS date_text`,
    },
    { sql: `INSERT INTO wordflow.nodes(table_name) VALUES (?)`, parameters: [node] },
  ], { all: true });
  return mapArrowColumnsToInfo(await api.nodeSchema(base, node));
}
const cases: Record<BuildOperation['kind'], [string, BuildOperation['arguments'], unknown]> = {
  is_null: ['missing', {}, true],
  is_not_null: ['txt', {}, true],
  fill_null: ['missing', { value: '' }, ''],
  count: ['txt', {}, '1'],
  count_null: ['missing', {}, '1'],
  count_distinct: ['txt', {}, '1'],
  min: ['n', {}, '4.00000000'],
  max: ['n', {}, '4.00000000'],
  abs: ['n', {}, '4.00000000'],
  sign: ['n', {}, 1],
  round: ['n', { digits: '2' }, '4.00'],
  trunc: ['n', { digits: '2' }, '4.00'],
  floor: ['n', {}, '4'],
  ceil: ['n', {}, '4'],
  sqrt: ['n', {}, 2],
  power: ['n', { exponent: '2' }, 16],
  ln: ['n', {}, Math.log(4)],
  log10: ['n', {}, Math.log10(4)],
  exp: ['n', {}, Math.exp(4)],
  sum: ['n', {}, '4.00000000'],
  mean: ['n', {}, 4],
  median: ['n', {}, '4.00000000'],
  stddev: ['n', {}, null],
  variance: ['n', {}, null],
  lower: ['txt', {}, ' abç abç '],
  upper: ['txt', {}, ' ABÇ ABÇ '],
  trim: ['txt', {}, 'Abç Abç'],
  ltrim: ['txt', {}, 'Abç Abç '],
  rtrim: ['txt', {}, ' Abç Abç'],
  strip_accents: ['txt', {}, ' Abc Abc '],
  text_length: ['txt', {}, '9'],
  text_reverse: ['txt', {}, ' çbA çbA '],
  substring: ['txt', { start: '2', length: '3' }, 'Abç'],
  replace: ['txt', { value: 'Abç', replacement: "it's" }, " it's it's "],
  contains: ['txt', { value: 'ç' }, true],
  starts_with: ['txt', { value: ' A' }, true],
  ends_with: ['txt', { value: 'ç ' }, true],
  split: ['txt', { delimiter: ' ' }, ['', 'Abç', 'Abç', '']],
  parse_datetime: ['date_text', { format: '%Y-%m-%d %H:%M:%S.%f %z' }, '2026-09-15T02:34:56.123Z'],
  date_part: ['d', { part: 'isodow' }, '2'],
  date_trunc: ['ts', { unit: 'day' }, '2026-09-15T00:00:00.000Z'],
  format_datetime: ['ts', { format: '%Y-%m-%d %H:%M:%S.%f' }, '2026-09-15 12:34:56.123456'],
  not: ['b', {}, false],
  is_true: ['b', {}, true],
  is_false: ['b', {}, false],
  count_true: ['b', {}, '1'],
  count_false: ['b', {}, '0'],
  all_true: ['b', {}, true],
  any_true: ['b', {}, true],
  list_length: ['nums', {}, '4'],
  list_count: ['nums', {}, '3'],
  list_distinct: ['nums', {}, [1, 3]],
  list_sort: ['nums', { direction: 'ASC' }, [1, 3, 3, null]],
  list_reverse: ['nums', {}, [3, 1, null, 3]],
  list_extract: ['nums', { index: '-1' }, 3],
  list_slice: ['nums', { start: '2', end: '3' }, [null, 1]],
  list_contains: ['nums', { value: '1' }, true],
  list_join: ['words', { delimiter: '-' }, 'a-b'],
  list_sum: ['nums', {}, '7'],
  list_mean: ['nums', {}, 7 / 3],
  list_min: ['nums', {}, 1],
  list_max: ['nums', {}, 3],
};
it('every Build operation creates a new View through the pinned DuckDB engine', async () => {
  const columns = await seed();
  expect(Object.keys(cases).sort()).toEqual([...operationKinds].sort());
  for (const kind of operationKinds) {
    const [column, args, expected] = cases[kind];
    const tokens = [token(column, [op(kind, args)])];
    const read = async (expression: string) =>
      decodeArrowData(
        await api.querySql(base, [{ sql: `SELECT ${expression} AS result FROM ${table(node)}` }]),
      ).rows[0]?.result;
    const generated = buildExpression(tokens, columns);
    const parsed = parsedBuildExpression(await api.parseExpression(base, generated), columns);
    expect(parsed.kind).not.toBe('sql');
    const roundtrip = compile({ mode: 'visual', roots: [parsed] }, columns);
    const value = await read(generated);
    expect(await read(roundtrip)).toEqual(value);
    const scalarSql = buildExpression(tokens, columns, node);
    const parsedScalar = parsedBuildExpression(await api.parseExpression(base, scalarSql), columns);
    expect(parsedScalar.kind).not.toBe('sql');
    expect(await read(compile({ mode: 'visual', roots: [parsedScalar] }, columns))).toEqual(value);
    if (kind === 'list_distinct') expect([...(value as number[])].sort()).toEqual(expected);
    else if (typeof expected === 'number') expect(Number(value)).toBeCloseTo(expected, 10);
    else expect(value).toEqual(expected);
    const name = `built_${kind}`;
    await applyTransformation(
      base,
      {
        select: columnSelect('output', generated, []),
        currentInput: node,
        mappings: [],
      },
      name,
    );
    const output = decodeArrowData(
      await api.querySql(base, [{ sql: `SELECT output FROM ${table(name)}` }]),
    ).rows[0]?.output;
    expect(output).toEqual(value);
    expect((await api.nodeSchema(base, node)).some((field) => field.name === 'output')).toBe(false);
  }
});
it('Build chains preserve native types, summaries, View propagation and rollback', async () => {
  const columns = await seed();
  await api.executeSql(base, [{ sql: `INSERT INTO ${table(node)} SELECT * FROM ${table(node)}` }], { all: true });
  const cases_ = [
    [token('txt', [op('trim'), op('lower'), op('count_distinct')])],
    [token('txt', [op('split', { delimiter: ' ' }), op('list_length'), op('mean')])],
    [token('n', [op('mean'), op('round', { digits: '2' })])],
  ];
  for (const [index, tokens] of cases_.entries()) {
    const select = columnSelect('computed', buildExpression(tokens, columns), []);
    const transformation = { select, currentInput: node, mappings: [] };
    await applyTransformation(base, transformation, `live_${String(index)}`);
    const data = decodeArrowData(
      await api.querySql(base, [
        { sql: `SELECT computed FROM data.live_${String(index)} LIMIT 1` },
      ]),
    ).rows;
    expect(data).toHaveLength(1);
    expect(data[0]?.computed).toEqual(index === 0 ? '1' : 4);
  }
  await api.changeColumn(base, 'live_0', { operation: 'transform', column: 'computed', expression: 'NULL' });
  await api.undoNode(base, 'live_0');
  expect((await api.querySql(base, [{ sql: 'SELECT * FROM data.live_0' }])).numRows).toBe(
    2,
  );
  const numeric = [
    {
      id: 'literal',
      kind: 'literal' as const,
      literalType: 'number' as const,
      operations: [],
      value: '9007199254740993.123456789',
    },
  ];
  expect(
    decodeArrowData(
      await api.querySql(base, [{ sql: `SELECT ${buildExpression(numeric, columns)} AS v` }]),
    ).rows[0]?.v,
  ).toBe('9007199254740993.123456789');
  const timestamp = buildExpression(
    [token('date_text', [op('parse_datetime', { format: '%Y-%m-%d %H:%M:%S.%f %z' })])],
    columns,
  );
  expect(
    decodeArrowData(
      await api.querySql(base, [
        {
          sql: `SELECT strftime(${timestamp}, '%Y-%m-%d %H:%M:%S.%f %z') AS v FROM ${table(node)} LIMIT 1`,
        },
      ]),
    ).rows[0]?.v,
  ).toBe('2026-09-15 02:34:56.123456 +00');
  const lists = buildExpression([token('nums'), token('nums')], columns, undefined, 'list_concat');
  expect(
    decodeArrowData(
      await api.querySql(base, [{ sql: `SELECT ${lists} AS v FROM ${table(node)} LIMIT 1` }]),
    ).rows[0]?.v,
  ).toEqual([3, null, 1, 3, 3, null, 1, 3]);
  const invalid = 'missing_column + 1';
  await expect(
    applyTransformation(
      base,
      {
        select: columnSelect('bad', invalid, []),
        currentInput: node,
        mappings: [],
      },
      'failed',
    ),
  ).rejects.toThrow();
  expect((await api.graph(base)).nodes.some((n) => n.table_name === 'failed')).toBe(false);
  await api.executeSql(base, [{ sql: `DELETE FROM ${table(node)}` }], { all: true });
  expect((await api.querySql(base, [{ sql: 'SELECT * FROM data.live_0' }])).numRows).toBe(
    0,
  );
});

it('Build uses dictionary text and native empty/NULL list behavior', async () => {
  const columns = await seed();
  const category = buildExpression([token('category', [op('lower')])], columns);
  expect(
    decodeArrowData(
      await api.querySql(base, [{ sql: `SELECT ${category} AS value FROM ${table(node)}` }]),
    ).rows[0]?.value,
  ).toBe('a');
  const untouched = await api.querySql(base, [
    {
      sql: `SELECT ${buildExpression([token('category')], columns)} AS category FROM ${table(node)}`,
    },
  ]);
  expect(DataType.isDictionary(untouched.schema.fields[0]?.type)).toBe(true);
  expect(untouched.getChild('category')?.data[0]?.dictionary?.toArray()).toContain('unused');
  await api.executeSql(base, [
    { sql: `UPDATE ${table(node)} SET nums=[], words=[], missing=NULL` },
  ], { all: true });
  for (const [kind, expected] of [
    ['list_length', '0'],
    ['list_count', '0'],
    ['list_mean', null],
    ['list_join', ''],
  ] as const) {
    const expression = buildExpression(
      [
        token(kind === 'list_join' ? 'words' : 'nums', [
          op(kind, kind === 'list_join' ? { delimiter: '-' } : {}),
        ]),
      ],
      columns,
    );
    expect(
      decodeArrowData(
        await api.querySql(base, [{ sql: `SELECT ${expression} AS value FROM ${table(node)}` }]),
      ).rows[0]?.value,
    ).toEqual(expected);
  }
  await api.executeSql(base, [{ sql: `DELETE FROM ${table(node)}` }], { all: true });
  const empty = await api.querySql(base, [
    {
      sql: `SELECT ${buildExpression([token('n', [op('mean')])], columns)} AS average FROM ${table(node)}`,
    },
  ]);
  expect(empty.numRows).toBe(0);
  expect(DataType.isFloat(empty.schema.fields[0]?.type)).toBe(true);
});

it('Build menus, parameter editing and chip contrast work in both themes and narrow panes', async () => {
  await seed();
  const longColumn =
    'A long column name with spaces and a "quoted" identifier that must wrap within this narrow pane';
  await api.executeSql(base, [
    { sql: `ALTER TABLE ${table(node)} ADD COLUMN ${api.identifier(longColumn)} VARCHAR` },
  ], { all: true });
  await browser.setViewport({ width: 1100, height: 850 });
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'Build', exact: true }).click();
  const pane = role('tabpanel', { name: 'Build', exact: true });
  await role('button', { name: 'Add data block', exact: true }, pane).click();
  await role('button', { name: node, exact: true }).click();
  await role('button', { name: 'Add column txt', exact: true }, pane).click();
  const chip = role('button', { name: 'txt', exact: true }, pane);
  for (const theme of ['light', 'dark']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', `${value}-2026`);
      document.documentElement.style.colorScheme = value;
    }, theme);
    const palette = chip;
    const colors = await (await palette.getElement()).execute((element) => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(colors.text).not.toBe(colors.background);
    await chip.click();
    await role('textbox', { name: 'Search operations' }).setValue('Split');
    await role('button', { name: 'Split', exact: true }).click();
    await expect(label('Delimiter')).toHaveValue(' ', { trim: false });
    await expect(browser.$('[data-slot=popover-content]')).toHaveStyle({ opacity: '1' });
    await screenshot(`/tmp/build-${theme}-parameters.png`);
    await role('button', { name: 'Add operation', exact: true }, role('dialog')).click();
    await chip.click();
    await expect(role('button', { name: 'List length', exact: true })).toBeDisplayed();
    await role('button', { name: 'List length', exact: true }).click();
    await chip.click();
    await role('button', { name: 'Mean', exact: true }).click();
    await chip.click();
    await expect(role('button', { name: 'Sum', exact: true })).toBeDisabled();
    const bounds = await rect(browser.$('[data-slot=popover-content]'));
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    // Radix positions can land on fractional CSS pixels.
    const viewportHeight = await browser.execute(() => window.innerHeight);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewportHeight + 1);
    await expect(browser.$('[data-slot=popover-content]')).toHaveStyle({ opacity: '1' });
    await screenshot(`/tmp/build-${theme}-chain.png`);
    await press('Escape');
    await role('button', { name: 'Remove Mean', exact: true }, pane).click();
    await role('button', { name: 'Remove List length', exact: true }, pane).click();
    await role('button', { name: 'Remove Split', exact: true }, pane).click();
  }
  await role('button', { name: `Add column ${longColumn}`, exact: true }, pane).click();
  await role('button', { name: 'Cancel', exact: true }).click();
  const row = testId('build-bubble', { index: 1 }, pane);
  expect(
    await (await row.getElement()).execute((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await (
    await role('button', { name: `Drag ${longColumn}`, exact: true }, pane).getElement()
  ).execute((element) => {
    element.focus();
  });
  await press('Space');
  await press('ArrowLeft');
  await press('Enter');
  await expect(testId('build-bubble', {}, pane)).toHaveText(expect.stringContaining(longColumn));
  await role('button', { name: 'Choose how to combine' }, pane).click();
  await role('button', { name: 'Join text', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', `${value}-2026`);
      document.documentElement.style.colorScheme = value;
    }, theme);
    await testId('build-bubble', {}, pane).scrollIntoView({ block: 'nearest' });
    await screenshot(`/tmp/build-${theme}-composition.png`);
  }
});

it('explicit Build combinations preserve native NULLs, ordering, precise values and final summaries', async () => {
  const columns = await seed();
  const value = (
    literalType: 'text' | 'number' | 'boolean' | 'null',
    text = '',
  ): BuildBuilderToken => ({
    id: text,
    kind: 'literal',
    literalType,
    value: text,
    operations: [],
  });
  const number = (text: string) => value('number', text);
  const nil = value('null');
  const combinations: [BuildCombinationKind, BuildBuilderToken[], unknown][] = [
    ['text', [value('text', ' A '), nil, value('text', "O'Brien")], " A  · O'Brien"],
    ['add', [number('8'), number('2'), number('2')], 12],
    ['subtract', [number('8'), number('2'), number('2')], 4],
    ['multiply', [number('8'), number('2'), number('2')], 32],
    ['divide', [number('8'), number('2'), number('2')], 2],
    ['greatest', [number('8'), nil, number('2')], 8],
    ['least', [number('8'), nil, number('2')], 2],
    ['coalesce', [nil, value('text', '00123'), value('text', 'fallback')], '00123'],
    ['list', [number('8'), nil, number('2')], [8, null, 2]],
    ['list_concat', [token('words'), nil, token('words')], ['a', null, 'b', 'a', null, 'b']],
    ['and', [value('boolean', 'false'), nil], false],
    ['or', [value('boolean', 'true'), nil], true],
    ['add', [number('8'), nil], null],
    ['and', [value('boolean', 'true'), nil], null],
    ['or', [value('boolean', 'false'), nil], null],
  ];
  const read = async (definition: BuildVisualDefinition) =>
    decodeArrowData(
      await api.querySql(base, [
        {
          sql: `SELECT ${compile(definition, columns)} AS result FROM ${table(node)}`,
        },
      ]),
    ).rows[0]?.result;
  for (const [kind, parts, expected] of combinations) {
    const definition = visual(parts, kind);
    if (definition.roots[0]?.kind === 'combination' && definition.roots[0].combination)
      definition.roots[0].combination.separator = ' · ';
    const roundtrip = parsedBuildExpression(
      await api.parseExpression(base, compile(definition, columns)),
      columns,
    );
    expect(roundtrip.kind).not.toBe('sql');
    expect(await read({ mode: 'visual', roots: [roundtrip] })).toEqual(expected);
    expect(await read(definition)).toEqual(expected);
  }
  const finalSummary = {
    ...visual([token('words'), token('words')], 'list_concat'),
    roots: visual([token('words'), token('words')], 'list_concat').roots.map((root) => ({
      ...root,
      operations: [
        op('list_length'),
        { ...op('mean'), summary: { kind: 'scalar' as const, source: ['data', node] } },
        op('round', { digits: '2' }),
      ],
    })),
  };
  expect(await read(finalSummary)).toEqual(6);
  await applyTransformation(
    base,
    {
      select: columnSelect('combined', compile(finalSummary, columns), []),
      currentInput: node,
      mappings: [],
    },
    'combined_view',
  );
  expect(
    decodeArrowData(
      await api.querySql(base, [{ sql: 'SELECT combined FROM data.combined_view' }]),
    ).rows[0]?.combined,
  ).toBe(6);
  const exact = visual([number('9007199254740993.123456789'), number('0.000000001')], 'add');
  expect(await read(exact)).toBe('9007199254740993.123456790');
  await expect(read(visual([token('d'), token('nums')], 'coalesce'))).rejects.toThrow();
  await api.executeSql(base, [{ sql: `DELETE FROM ${table(node)}` }], { all: true });
  expect(await read(finalSummary)).toBeUndefined();
});

it('handwritten Build expressions create Views, preserve inputs and reject conflicting names', async () => {
  const columns = await seed();
  const definition = {
    mode: 'sql' as const,
    expression: `CASE WHEN "b" THEN upper(trim("txt")) ELSE 'empty' END -- keep comment`,
  };
  const expression = compile(definition, columns);
  const transformation = {
    select: columnSelect(
      'result',
      expression,
      columns.map((c) => c.name),
    ),
    currentInput: node,
    mappings: [],
  };
  for (const kind of ['view'] as const) {
    await applyTransformation(base, transformation, `sql_${kind}`);
    expect(
      decodeArrowData(
        await api.querySql(base, [{ sql: `SELECT result FROM data.sql_${kind}` }]),
      ).rows[0]?.result,
    ).toBe('ABÇ ABÇ');
  }
  const competing = await Promise.allSettled([
    applyTransformation(base, transformation, 'competing_build'),
    applyTransformation(base, transformation, 'competing_build'),
  ]);
  expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(
    (await api.graph(base)).nodes.filter((node) => node.table_name === 'competing_build'),
  ).toHaveLength(1);
  expect((await api.nodeSchema(base, node)).some((c) => c.name === 'result')).toBe(false);
  await expect(
    api.querySql(base, [
      {
        sql: `SELECT ${compile({ mode: 'sql', expression: '1; DELETE FROM wordflow.nodes' }, columns)} FROM ${table(node)}`,
      },
    ]),
  ).rejects.toThrow();
  expect((await api.graph(base)).nodes.some((n) => n.table_name === node)).toBe(true);
});

it('Build SQL handoff inserts columns at the cursor, retains output on errors and reconstructs edited SQL', async () => {
  await seed();
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'Build', exact: true }).click();
  const pane = role('tabpanel', { name: 'Build', exact: true });
  await role('button', { name: 'Add data block', exact: true }, pane).click();
  await role('button', { name: node, exact: true }).click();
  await role('button', { name: 'Add column txt', exact: true }, pane).click();
  await expect(role('cell', { name: 'Abç Abç', exact: true, index: -1 }, pane)).toBeDisplayed();
  await role('button', { name: 'Edit SQL expression' }, pane).click();
  const editor = pane.$('.cm-content');
  await expect(editor).toHaveText('"txt"');
  await editor.setValue('upper()');
  await press('ArrowLeft', editor);
  await role('button', { name: 'Insert column' }, pane).click();
  await role('button', { name: 'txt', exact: true }).click();
  await expect(editor).toHaveText('upper("txt")');
  await expect(role('cell', { name: 'ABÇ ABÇ', exact: true }, pane)).toBeDisplayed();
  await editor.setValue('upper()');
  await press('Backspace', editor);
  await expect(role('status', {}, pane)).toHaveText(expect.stringMatching(/Parser|syntax/));
  await expect(
    text('Outdated preview — showing the last successful result.', {}, pane),
  ).toBeDisplayed();
  await expect(role('cell', { name: 'ABÇ ABÇ', exact: true }, pane)).toBeDisplayed();
  await expect(role('button', { name: 'Create Data Block', exact: true }, pane)).toBeEnabled();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
  await role('button', { name: 'Return to bubble builder' }, pane).click();
  await expect(editor).toHaveText('upper(');
  await editor.setValue('upper("txt")');
  await role('button', { name: 'Return to bubble builder' }, pane).click();
  await expect(role('button', { name: 'Edit Uppercase' }, pane)).toBeDisplayed();
  await expect(role('cell', { name: 'ABÇ ABÇ', exact: true }, pane)).toBeDisplayed();
});

it('nested expressions preserve grouping, exact casts and SQL fragments without execution during conversion', async () => {
  const columns = await seed();
  const expressions = [
    '("n" + 1) / (CAST(2 AS DECIMAL(20,9)) - 1)',
    '("n" - 1) - (2 - 3)',
    '1e16 + (-1e16 + 1)',
    `concat_ws(':', lower(CASE WHEN b THEN txt ELSE '世界' END), txt)`,
    'coalesce((SELECT max(n) FROM data."build""source"), n)',
    'CAST(900719925474099312345678.123456789 AS DECIMAL(38,9))',
    `replace(txt, 'ç', '世;界')`,
    `substring(txt, -3)`,
    `count(DISTINCT lower(txt)) OVER ()`,
    `sum(n) OVER (ORDER BY n)`,
    `main.upper(txt)`,
    `lower("TXT")`,
    `greatest(txt, 'zz')`,
  ];
  for (const sql of expressions) {
    const root = parsedBuildExpression(await api.parseExpression(base, sql), columns);
    const roundtrip = compile({ mode: 'visual', roots: [root] }, columns);
    const read = async (expression: string) =>
      decodeArrowData(
        await api.querySql(base, [{ sql: `SELECT ${expression} AS v FROM ${table(node)}` }]),
      ).rows;
    expect(await read(roundtrip)).toEqual(await read(sql));
  }
  await api.executeSql(base, [{ sql: `INSERT INTO ${table(node)} SELECT * FROM ${table(node)}` }], { all: true });
  const scalarWindow = `(SELECT sum(n) OVER () FROM ${table(node)})`;
  const opaqueWindow = parsedBuildExpression(
    await api.parseExpression(base, scalarWindow),
    columns,
  );
  expect(opaqueWindow.kind).toBe('sql');
  expect(opaqueWindow.operations).toEqual([]);
  await expect(
    api.querySql(base, [
      { sql: `SELECT ${compile({ mode: 'visual', roots: [opaqueWindow] }, columns)}` },
    ]),
  ).rejects.toThrow(/more than one row/i);
  const mixed = parsedBuildExpression(
    await api.parseExpression(base, `lower(CASE WHEN b THEN txt ELSE '' END)`),
    columns,
  );
  expect(mixed.kind).toBe('sql');
  expect(mixed.operations.map((item) => item.kind)).toEqual(['lower']);
  if (mixed.kind === 'sql') expect(mixed.expression).toMatch(/^CASE/);
  const window = { mode: 'visual' as const, roots: [token('n', [op('mean')])] };
  const expression = compile(window, columns);
  await applyTransformation(
    base,
    {
      select: columnSelect('unchanged_summary', expression, []),
      currentInput: node,
      mappings: [],
    },
    'window_summary',
  );
  expect(compile(window, columns)).toBe(expression);
  expect((await api.nodeSchema(base, node)).some((field) => field.name === 'unchanged_summary')).toBe(
    false,
  );
});

it('palette drag copies, nested drops move subtrees, and second-root cancellation keeps the draft', async () => {
  await browser.setViewport({ width: 1400, height: 1100 });
  await seed();
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'Build', exact: true }).click();
  const pane = role('tabpanel', { name: 'Build', exact: true });
  await role('button', { name: 'Add data block', exact: true }, pane).click();
  await role('button', { name: node, exact: true }).click();
  const drag = async (source: ChainablePromiseElement, target: ChainablePromiseElement) => {
    await source.scrollIntoView({ block: 'nearest' });
    const start = await rect(source);

    const x = start.x + 8,
      y = start.y + 8;
    const context = await browser.getWindowHandle();
    // BiDi preserves pointer capture across calls while we inspect the floating bubble.
    await browser.inputPerformActions({
      context,
      actions: [
        {
          type: 'pointer',
          id: 'build-drag',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 0 },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', x: Math.round(x + 12), y: Math.round(y + 12), duration: 0 },
          ],
        },
      ],
    });
    const floating = testId('build-drag-preview');
    await expect(floating).toBeDisplayed();
    await expect(floating).toHaveStyle({ 'pointer-events': 'none' });
    const preview = await rect(floating);
    if ((await source.getAttribute('aria-label'))?.startsWith('Add column'))
      expect(preview.x).toBeCloseTo(start.x + 12, 0);
    await (await target.getElement()).execute((el) => {
      el.scrollIntoView({ block: 'nearest' });
    });
    const end = await rect(target);

    await browser.inputPerformActions({
      context,
      actions: [
        {
          type: 'pointer',
          id: 'build-drag',
          parameters: { pointerType: 'mouse' },
          actions: [
            {
              type: 'pointerMove',
              x: Math.round(end.x + end.width / 2),
              y: Math.round(end.y + end.height / 2),
              duration: 200,
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
    await expect(floating).not.toExist();
  };
  await drag(
    role('button', { name: 'Add column n', exact: true }, pane),
    pane.$('[data-drop-parent="root"][data-drop-index="0"]'),
  );
  await expect(role('button', { name: 'n', exact: true }, pane)).toBeDisplayed();
  await drag(
    role('button', { name: 'Add column txt', exact: true }, pane),
    pane.$('[data-drop-parent="root"][data-drop-index="1"]'),
  );
  await role('button', { name: 'Cancel', exact: true }).click();
  await expect(testIds('build-bubble', {}, pane)).toBeElementsArrayOfSize(2);
  await expect(role('button', { name: 'Edit SQL expression' }, pane)).toBeEnabled();
  await expect(text('Draft SQL', { exact: true }, pane)).toBeDisplayed();
  await role('button', { name: 'Choose how to combine' }, pane).click();
  await role('button', { name: 'Join text', exact: true }).click();
  const root = testId('build-bubble', {}, pane);
  const rootId = await root.getAttribute('data-expression-id');
  await role('button', { name: 'Add function', exact: true }, root).click();
  await role('button', { name: 'Join text', exact: true, index: -1 }).click();
  const nestedId = await testId('build-bubble', { index: -1 }, root).getAttribute(
    'data-expression-id',
  );
  if (!rootId || !nestedId) throw new Error('Missing expression identity');
  const nested = pane.$(`[data-expression-id="${nestedId}"]`);
  const siblings = testId('build-bubble', {}, root);
  const leafBounds = await rect(siblings);
  const nestedBounds = await rect(nested);
  expect(nestedBounds.x).toBe(leafBounds.x);
  const rootBounds = await rect(root);
  const builderTop = await rect(role('button', { name: 'Expression root', exact: true }, pane));
  expect(rootBounds.y - builderTop.y - builderTop.height).toBeLessThan(16);
  await expect(text('Needs input', { exact: true }, pane)).toBeDisplayed();
  await expect(pane.$('pre')).toHaveText(
    expect.stringContaining("concat_ws(' ', /* add input */)"),
  );

  await drag(
    role('button', { name: 'Add column txt', exact: true }, pane),
    pane.$(`[data-drop-parent="${nestedId}"][data-drop-index="0"]`),
  );
  await expect(role('button', { name: 'txt', exact: true }, nested)).toBeDisplayed();
  await drag(
    role('button', { name: 'Drag n', exact: true }, root),
    pane.$(`[data-drop-parent="${nestedId}"][data-drop-index="1"]`),
  );
  await expect(role('button', { name: 'n', exact: true }, nested)).toBeDisplayed();
  // A containing bubble cannot be dropped into its own descendants.
  await drag(
    role('button', { name: 'Drag Join text', exact: true }, root),
    pane.$(`[data-drop-parent="${nestedId}"][data-drop-index="0"]`),
  );
  await expect(pane.$(`[data-expression-id="${rootId}"]`)).toBeDisplayed();
  await expect(testIds('build-bubble', {}, pane)).toBeElementsArrayOfSize(5);
  const nestedHandle = role('button', { name: 'Drag Join text', exact: true }, nested);
  await (await nestedHandle.getElement()).execute((element) => {
    element.focus();
  });
  await press('Space');
  await press('ArrowLeft');
  await press('Enter');
  await expect(testId('build-bubble', {}, root)).toHaveAttribute('data-expression-id', nestedId);
  await (await nestedHandle.getElement()).execute((element) => {
    element.focus();
  });
  await press('Space');
  await press('ArrowRight');
  await press('Escape');
  await expect(testId('build-bubble', {}, root)).toHaveAttribute('data-expression-id', nestedId);
  await expect(text('Move cancelled.', { exact: true })).toExist();
  for (const theme of ['light', 'dark']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', `${value}-2026`);
      document.documentElement.style.colorScheme = value;
    }, theme);
    await browser.setViewport({ width: 1000, height: 1000 });
    await root.scrollIntoView({ block: 'nearest' });
    expect(
      await (await root.getElement()).execute(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const nestedBox = await rect(nested);
    const siblingBox = await rect(testId('build-bubble', { index: -1 }, root));
    expect(nestedBox.x).toBe(siblingBox.x);
    await screenshot(`/tmp/build-refine-${theme}.png`);
  }
  await role('button', { name: 'Edit SQL expression' }, pane).click();
  await expect(pane.$('.cm-content')).toHaveText(expect.stringContaining('concat_ws'));
  await role('button', { name: 'Return to bubble builder' }, pane).click();
  await expect(testIds('build-bubble', {}, pane)).toBeElementsArrayOfSize(5);
});
