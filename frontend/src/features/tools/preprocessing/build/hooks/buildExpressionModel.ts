import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import { identifier } from '@/features/project/api';
import { literal } from '../../sql';
import {
  applyBuildOperation,
  renderBuildOperation,
  operationDefinition,
  columnChain,
  type BuildChain,
  type BuildOperation,
  type BuildType,
} from '../operations';

export type BuildLiteralType = 'text' | 'number' | 'boolean' | 'null';
export type BuildBuilderToken = (
  | { kind: 'column'; column: string }
  | { kind: 'literal'; literalType: BuildLiteralType; value: string }
  | { kind: 'combination'; combination: BuildCombination | null; children: BuildBuilderToken[] }
  | { kind: 'sql'; expression: string }
) & { id: string; operations: BuildOperation[] };
export type BuildCombinationKind =
  | 'text'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'greatest'
  | 'least'
  | 'coalesce'
  | 'list'
  | 'list_concat'
  | 'and'
  | 'or';
export interface BuildCombination {
  kind: BuildCombinationKind;
  separator: string;
}
export interface BuildVisualDefinition {
  mode: 'visual';
  roots: BuildBuilderToken[];
}
export type BuildDefinition = BuildVisualDefinition | { mode: 'sql'; expression: string };
export interface BuildColumnRequest {
  definition: BuildDefinition;
  column: string;
}
export const emptyVisualBuild = (): BuildVisualDefinition => ({
  mode: 'visual',
  roots: [],
});

const family = (type: BuildType): string =>
  type.family === 'list' ? `list of ${family(type.element)}` : type.family;
export const buildTypeLabel = (type: BuildType): string => family(type);
const knownTypes = (chains: BuildChain[]) =>
  chains.map(({ type }) => type).filter((t) => t.family !== 'null');
const all = (chains: BuildChain[], expected: string) =>
  knownTypes(chains).every((t) => t.family === expected);
const commonType = (types: BuildType[]): BuildType => {
  const present = types.filter((type) => type.family !== 'null');
  const first = present[0];
  return first && present.every((type) => family(type) === family(first))
    ? first
    : { family: 'unknown' };
};
interface CombinationDefinition {
  kind: BuildCombinationKind;
  label: string;
  group: string;
  description: string;
  accepts: (parts: BuildChain[]) => boolean;
}
export const buildCombinations: CombinationDefinition[] = [
  {
    kind: 'text',
    label: 'Join text',
    group: 'Text',
    description:
      'Joins parts with the separator, skipping NULL values. Leave the separator empty to join directly.',
    accepts: (p) =>
      knownTypes(p).every((t) => !['list', 'unknown', 'unsupported'].includes(t.family)),
  },
  ...(['add', 'subtract', 'multiply', 'divide', 'greatest', 'least'] as const).map((kind) => ({
    kind,
    label: {
      add: 'Add',
      subtract: 'Subtract in order',
      multiply: 'Multiply',
      divide: 'Divide in order',
      greatest: 'Greatest',
      least: 'Least',
    }[kind],
    group: 'Numeric',
    description: ['subtract', 'divide'].includes(kind)
      ? 'Evaluates from the first part to the last.'
      : 'Uses DuckDB’s native numeric and NULL behaviour.',
    accepts: (p: BuildChain[]) => all(p, 'number'),
  })),
  {
    kind: 'coalesce',
    label: 'First non-NULL',
    group: 'Values',
    description: 'Uses the first non-NULL part. DuckDB determines compatible types.',
    accepts: () => true,
  },
  {
    kind: 'list',
    label: 'Make list',
    group: 'Values',
    description:
      'Keeps each part as a separate element, including NULLs. DuckDB determines a common element type.',
    accepts: () => true,
  },
  {
    kind: 'list_concat',
    label: 'Concatenate lists',
    group: 'Lists',
    description: 'Joins list contents, skipping NULL lists and retaining NULL elements.',
    accepts: (p) => all(p, 'list'),
  },
  ...(['and', 'or'] as const).map((kind) => ({
    kind,
    label: kind.toUpperCase(),
    group: 'Boolean',
    description: 'Uses DuckDB’s three-valued Boolean logic, including NULL.',
    accepts: (p: BuildChain[]) => all(p, 'boolean'),
  })),
];

export function partChain(part: BuildBuilderToken, columns: ColumnInfo[]): BuildChain {
  let chain: BuildChain;
  if (part.kind === 'column') {
    chain = columnChain(part.column, columns.find((c) => c.name === part.column)?.field, []);
  } else if (part.kind === 'combination') {
    chain = combine(
      part.children.map((child) => partChain(child, columns)),
      part.combination,
    );
  } else if (part.kind === 'sql') {
    if (!part.expression.trim()) throw new Error('Enter a SQL expression');
    chain = { sql: `(\n${part.expression}\n)`, type: { family: 'unknown' }, summarized: false };
  } else {
    chain = literalChain(part);
  }
  part.operations.forEach((operation, index) => {
    try {
      chain = applyBuildOperation(chain, operation);
    } catch (error) {
      throw new Error(
        `Step ${String(index + 1)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });
  return chain;
}
function literalChain(part: Extract<BuildBuilderToken, { kind: 'literal' }>): BuildChain {
  let sql: string;
  if (part.literalType === 'number') {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(part.value.trim()))
      throw new Error('Enter a number');
    sql = part.value.trim();
  } else if (part.literalType === 'boolean') {
    if (!['true', 'false'].includes(part.value)) throw new Error('Choose true or false');
    sql = part.value.toUpperCase();
  } else sql = part.literalType === 'null' ? 'NULL' : literal(part.value);
  return { sql, type: { family: part.literalType }, summarized: false };
}
function combine(parts: BuildChain[], combination: BuildCombination | null): BuildChain {
  if (!combination) throw new Error('Choose how to combine these bubbles');
  if (!parts.length) throw new Error('Add an expression to the function');
  const option = buildCombinations.find(({ kind }) => kind === combination.kind);
  if (!option) throw new Error('Choose a combination');
  const unknown = parts.some((part) => part.type.family === 'unknown');
  if (!unknown && !option.accepts(parts))
    throw new Error(
      `${option.label} is unavailable for these part types. Choose another combination.`,
    );
  return {
    sql: combineSql(
      parts.map((part) => part.sql),
      combination,
    ),
    type:
      combination.kind === 'text'
        ? { family: 'text' }
        : ['and', 'or'].includes(combination.kind)
          ? { family: 'boolean' }
          : ['add', 'subtract', 'multiply', 'divide'].includes(combination.kind)
            ? { family: unknown ? 'unknown' : 'number' }
            : combination.kind === 'list'
              ? { family: 'list', element: commonType(parts.map((p) => p.type)) }
              : commonType(parts.map((p) => p.type)),
    summarized: parts.some((part) => part.summarized),
  };
}
function combineSql(values: string[], combination: BuildCombination | null): string {
  const inputs = values.length ? values : ['/* add input */'];
  if (!combination) return `<choose_function>(\n${inputs.join(',\n')}\n)`;
  switch (combination.kind) {
    case 'text':
      return `concat_ws(${literal(combination.separator)}, ${inputs.join(', ')})`;
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'and':
    case 'or': {
      const operator = {
        add: '+',
        subtract: '-',
        multiply: '*',
        divide: '/',
        and: 'AND',
        or: 'OR',
      }[combination.kind];
      if (!values.length) return `(/* add input */ ${operator} /* add input */)`;
      return inputs.reduce((left, right) => `(${left}) ${operator} (${right})`);
    }
    default: {
      const fn = {
        greatest: 'greatest',
        least: 'least',
        coalesce: 'coalesce',
        list: 'list_value',
        list_concat: 'list_concat',
      }[combination.kind];
      return `${fn}(${inputs.join(', ')})`;
    }
  }
}
interface BuildIssue {
  label: string;
  reason: string;
  kind: 'incomplete' | 'invalid';
}
/** Inspect without discarding SQL when one part is unfinished or invalid. */
export function inspectBuildPart(
  part: BuildBuilderToken,
  columns: ColumnInfo[],
): { chain: BuildChain; issue?: BuildIssue } {
  let chain: BuildChain = { sql: '', type: { family: 'unknown' }, summarized: false };
  let issue: BuildIssue | undefined;
  if (part.kind === 'combination') {
    const children = part.children.map((child) => inspectBuildPart(child, columns));
    chain.sql = combineSql(
      children.map((child) => child.chain.sql),
      part.combination,
    );
    if (!part.combination)
      issue = {
        label: 'Choose a function',
        reason: 'Choose how to combine these inputs.',
        kind: 'incomplete',
      };
    else if (!children.length)
      issue = {
        label: 'Needs input',
        reason: 'Add a column, value or function.',
        kind: 'incomplete',
      };
    else if (children.some((child) => child.issue)) {
      const child = children.find((child) => child.issue)?.issue;
      issue = {
        label: child?.kind === 'invalid' ? 'Check input' : 'Incomplete input',
        reason: child?.reason ?? 'Complete the input.',
        kind: child?.kind ?? 'incomplete',
      };
    }
    try {
      chain = combine(
        children.map((child) => child.chain),
        part.combination,
      );
    } catch (error) {
      issue ??= {
        label: 'Check inputs',
        reason: String(error instanceof Error ? error.message : error),
        kind: 'invalid',
      };
    }
  } else {
    if (part.kind === 'column') chain.sql = identifier(part.column);
    else if (part.kind === 'sql')
      chain.sql = part.expression.trim() ? `(\n${part.expression}\n)` : '/* add SQL expression */';
    else
      chain.sql =
        part.literalType === 'text'
          ? literal(part.value)
          : part.literalType === 'null'
            ? 'NULL'
            : part.value || `/* add ${part.literalType} value */`;
    try {
      chain = partChain({ ...part, operations: [] }, columns);
    } catch (error) {
      issue = {
        label: part.kind === 'column' ? 'Column unavailable' : 'Needs input',
        reason: error instanceof Error ? error.message : String(error),
        kind: part.kind === 'column' ? 'invalid' : 'incomplete',
      };
    }
  }
  part.operations.forEach((operation, index) => {
    try {
      applyBuildOperation(chain, operation);
    } catch (error) {
      issue ??= {
        label: 'Check operation',
        reason: `Step ${String(index + 1)} (${operationDefinition(operation.kind).label}): ${error instanceof Error ? error.message : String(error)}`,
        kind: 'invalid',
      };
    }
    try {
      chain = renderBuildOperation(chain, operation);
    } catch {
      chain = { ...chain, sql: `<${operation.kind}>(${chain.sql}, /* complete parameters */)` };
    }
  });
  return { chain, issue };
}
function draftExpression(roots: BuildBuilderToken[], columns: ColumnInfo[]) {
  if (!roots.length)
    return { expression: '/* Add a column, value or function */', incomplete: true };
  const parts = roots.map((root) => inspectBuildPart(root, columns));
  const first = parts[0];
  return {
    expression:
      parts.length === 1 && first
        ? first.chain.sql
        : combineSql(
            parts.map((part) => part.chain.sql),
            null,
          ),
    incomplete: parts.length !== 1 || parts.some((part) => part.issue?.kind === 'incomplete'),
  };
}

export function buildExpression(definition: BuildDefinition, columns: ColumnInfo[]): string {
  if (definition.mode === 'visual') {
    if (definition.roots.length !== 1)
      throw new Error(
        definition.roots.length
          ? 'Choose how to combine the root bubbles'
          : 'Add a column or value to build an expression',
      );
    const root = definition.roots[0];
    if (!root) throw new Error('Add an expression');
    return partChain(root, columns).sql;
  }
  if (!definition.expression.trim()) throw new Error('Enter a DuckDB expression');
  return `(\n${definition.expression}\n)`;
}
export const buildColumnRequest = (
  definition: BuildDefinition,
  columnName: string,
): BuildColumnRequest => ({ definition, column: columnName.trim() });
export function validateBuild(definition: BuildDefinition, columns: ColumnInfo[]) {
  try {
    return { expression: buildExpression(definition, columns), error: null, incomplete: false };
  } catch (error) {
    return {
      ...(definition.mode === 'visual'
        ? draftExpression(definition.roots, columns)
        : { expression: definition.expression, incomplete: true }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
