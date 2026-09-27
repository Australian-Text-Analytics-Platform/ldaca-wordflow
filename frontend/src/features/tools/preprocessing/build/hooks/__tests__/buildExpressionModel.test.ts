import { describe, expect, it } from 'vitest';
import {
  Field,
  Int64,
  Utf8,
  List,
  Bool,
  Decimal,
  Dictionary,
  Uint8,
  Struct,
  TimeMicrosecond,
} from 'apache-arrow';
import {
  buildColumnRequest,
  buildExpression as compile,
  emptyVisualBuild,
  partChain,
  buildCombinations,
  type BuildVisualDefinition,
  type BuildCombinationKind,
  validateBuild,
  type BuildBuilderToken,
} from '../buildExpressionModel';

import {
  applyBuildOperation,
  buildType,
  columnChain,
  operationDefinition,
  type BuildOperation,
} from '../../operations';
const fields = [
  new Field('speaker"name', new Int64()),
  new Field('text', new Utf8()),
  new Field('list', new List(new Field('item', new Utf8()))),
];
const columns = fields.map((field) => ({
  name: field.name,
  field,
  typeName: field.type.toString(),
}));
const op = (
  kind: BuildOperation['kind'],
  args: BuildOperation['arguments'] = {},
): BuildOperation => ({ kind, arguments: args });
const token = (column: string, operations: BuildOperation[] = []): BuildBuilderToken => ({
  id: '1',
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
  fields = columns,
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
    fields,
  );
const value = (
  literalType: 'text' | 'number' | 'boolean' | 'null',
  value: string,
): BuildBuilderToken => ({ id: 'v', kind: 'literal', literalType, value, operations: [] });
it('quotes identifiers and broadcasts summaries before or after scalar steps', () => {
  const tokens = [token('speaker"name', [op('mean'), op('round', { digits: '2' })])];
  expect(buildExpression(tokens, columns)).toContain('round(((avg("speaker""name") OVER ())), 2)');
  expect(buildExpression(tokens, columns, 'source')).toContain(
    'SELECT avg("speaker""name") FROM "data"."source"',
  );
  expect(
    buildExpression([token('text', [op('trim'), op('lower'), op('count_distinct')])], columns),
  ).toContain('count(DISTINCT (lower((trim("text"))))) OVER ()');
});
it('preserves explicitly typed literals and requires a combination', () => {
  const literal = value('number', '9007199254740993.123456789');
  expect(buildExpression([literal])).toBe(literal.value);
  expect(buildExpression([value('text', '00123 “hello”')])).toBe("'00123 “hello”'");
  expect(buildExpression([value('text', "it's safe")])).toBe("'it''s safe'");
  expect(buildExpression([value('text', '')])).toBe("''");
  expect(buildExpression([value('null', '')])).toBe('NULL');
  expect(() => buildExpression([token('list'), token('list')])).toThrow('Choose how to combine');
  expect(buildExpression([token('list'), token('list')], columns, undefined, 'list_concat')).toBe(
    'list_concat("list", "list")',
  );
  expect(buildColumnRequest(visual([literal]), 'new"name')).toEqual({
    definition: visual([literal]),
    column: 'new"name',
  });
});
it('tracks combined types, final steps, and summary ownership', () => {
  const list = visual(
    [token('text', [op('split', { delimiter: ' ' })]), token('list')],
    'list_concat',
  );
  expect(partChain(list.roots[0]!, columns).type).toEqual({
    family: 'list',
    element: { family: 'text' },
  });
  const summarized = {
    ...list,
    roots: list.roots.map((root) => ({
      ...root,
      operations: [op('list_length'), op('mean'), op('round', { digits: '2' })],
    })),
  };
  expect(partChain(summarized.roots[0]!, columns).type.family).toBe('number');
  expect(compile(summarized, columns)).toContain('OVER ()');
  const repeated = {
    ...visual([token('speaker"name', [op('mean')]), value('number', '2')], 'add'),
    roots: visual([token('speaker"name', [op('mean')]), value('number', '2')], 'add').roots.map(
      (root) => ({ ...root, operations: [op('mean')] }),
    ),
  };
  expect(validateBuild(repeated, columns).error).toContain('Step 1');
  expect(
    validateBuild(visual([token('text'), token('list')], 'list_concat'), columns).error,
  ).toContain('Concatenate lists is unavailable');
  expect(
    buildCombinations
      .filter((c) => c.accepts([partChain(list.roots[0]!, columns)]))
      .map((c) => c.kind),
  ).not.toContain('add');
});
it('preserves ordered arithmetic and handwritten SQL without interpreting it', () => {
  expect(
    buildExpression(
      [value('number', '20'), value('number', '5'), value('number', '2')],
      columns,
      undefined,
      'subtract',
    ),
  ).toBe('((20) - (5)) - (2)');
  const expression = 'CASE WHEN "text" IS NULL THEN 1 ELSE 2 END -- unchanged';
  expect(compile({ mode: 'sql', expression }, columns)).toBe(`(\n${expression}\n)`);
});
it('retains drafts and identifies invalidated operations or missing schema', () => {
  const tokens = [token('text', [op('split', { delimiter: ' ' }), op('list_length'), op('mean')])];
  expect(validateBuild(visual(tokens), columns).error).toBeNull();
  const invalid = [token('text', [op('list_length'), op('mean')])];
  expect(validateBuild(visual(invalid), columns).error).toContain('Step 1');
  expect(invalid[0]).toEqual(token('text', [op('list_length'), op('mean')]));
  expect(validateBuild(visual(tokens), []).error).toContain('unavailable');
  expect(validateBuild(visual([token('text', [op('count'), op('sum')])]), columns).error).toContain(
    'Only one column summary',
  );
});
it('rejects invalid and injectable parameters without losing precision', () => {
  expect(() =>
    columnChain('speaker"name', fields[0], [op('power', { exponent: '2); DROP TABLE x' })]),
  ).toThrow('Expected a number');
  expect(() => columnChain('speaker"name', fields[0], [op('round', { digits: '1.5' })])).toThrow(
    'integer',
  );
  expect(
    columnChain('speaker"name', fields[0], [
      op('fill_null', { value: '9007199254740993.123456789' }),
    ]).sql,
  ).toContain('9007199254740993.123456789');
});
describe('authoritative Arrow type families', () => {
  it('recognizes decimal, unsigned string dictionaries, lists and temporal subtypes', () => {
    expect(buildType(new Field('d', new Decimal(8, 30)))).toEqual({ family: 'number' });
    expect(buildType(new Field('e', new Dictionary(new Utf8(), new Uint8())))).toEqual({
      family: 'text',
    });
    const time = buildType(new Field('t', new TimeMicrosecond()));
    expect(operationDefinition('date_part').parameters?.(time)[0]?.options).toEqual([
      'hour',
      'minute',
      'second',
    ]);
    expect(buildType(fields[2])).toEqual({ family: 'list', element: { family: 'text' } });
  });
  it('limits structures and explicit semantic fields to NULL operations and counts', () => {
    for (const field of [
      new Field('s', new Struct([])),
      new Field('b', new Bool(), true, new Map([['ARROW:extension:name', 'TopicCoverage']])),
    ]) {
      const type = buildType(field);
      expect(type.family).toBe('unsupported');
      expect(operationDefinition('count').accepts(type)).toBe(true);
      expect(operationDefinition('min').accepts(type)).toBe(false);
      expect(operationDefinition('fill_null').accepts(type)).toBe(false);
      expect(
        applyBuildOperation({ sql: 's', type, summarized: false }, op('is_null')).type.family,
      ).toBe('boolean');
    }
  });
});

it('renders every unfinished subtree without inventing a value or a combination', () => {
  const empty: BuildBuilderToken = {
    id: 'nested',
    kind: 'combination',
    combination: { kind: 'text', separator: ' ' },
    children: [],
    operations: [],
  };
  const expression = visual(
    [token('text', [op('split', { delimiter: ' ' }), op('list_length')]), empty],
    'text',
  );
  const draft = validateBuild(expression, columns);
  expect(draft.error).toContain('Add an expression');
  expect(draft.expression).toContain('length((string_split("text", \' \')))');
  expect(draft.expression).toContain("concat_ws(' ', /* add input */)");
  expect(draft.expression).not.toContain('NULL');
  expect(draft.incomplete).toBe(true);
  const unresolved = validateBuild(
    visual([token('text'), value('number', '9007199254740993.123')]),
    columns,
  );
  expect(unresolved.expression).toBe('<choose_function>(\n"text",\n9007199254740993.123\n)');
  expect(unresolved.incomplete).toBe(true);
});
it('keeps catalogue SQL and operation order when a chain becomes incompatible', () => {
  const invalid = validateBuild(visual([token('text', [op('list_length'), op('mean')])]), columns);
  expect(invalid.error).toContain('Step 1');
  expect(invalid.expression).toBe('((avg((length("text"))) OVER ()))');
  expect(invalid.incomplete).toBe(false);
  for (const kind of buildCombinations.map((item) => item.kind)) {
    const parts =
      kind === 'list_concat'
        ? [token('list'), token('list')]
        : ['and', 'or'].includes(kind)
          ? [value('boolean', 'true'), value('boolean', 'false')]
          : [value('number', '2'), value('number', '3')];
    expect(validateBuild(visual(parts, kind), columns).expression).toBe(
      compile(visual(parts, kind), columns),
    );
  }
});

it('keeps the chosen operator visible in an empty arithmetic draft', () => {
  expect(validateBuild(visual([], 'multiply'), columns)).toMatchObject({
    expression: '(/* add input */ * /* add input */)',
    incomplete: true,
  });
});
