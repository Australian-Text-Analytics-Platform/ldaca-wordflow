import { resolveColumnName } from '../sql';
import type { ParsedExpression } from '@/features/project/api';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import {
  operationDefinition,
  operationKinds,
  type BuildOperation,
  type BuildOperationKind,
  type BuildType,
} from './operations';
import {
  partChain,
  type BuildBuilderToken,
  type BuildCombination,
  type BuildCombinationKind,
} from './hooks/buildExpressionModel';

const numericOperators: Record<string, BuildCombinationKind> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  CONJUNCTION_AND: 'and',
  CONJUNCTION_OR: 'or',
};
const functions: Record<string, BuildCombinationKind> = {
  concat_ws: 'text',
  greatest: 'greatest',
  least: 'least',
  coalesce: 'coalesce',
  list_value: 'list',
  list_concat: 'list_concat',
};
const unaryOperators: Record<string, BuildOperationKind> = {
  OPERATOR_IS_NULL: 'is_null',
  OPERATOR_IS_NOT_NULL: 'is_not_null',
  OPERATOR_NOT: 'not',
};

/** Recognize only the finite catalogue's syntax. All other syntax retains DuckDB's SQL. */
export function parsedBuildExpression(
  node: ParsedExpression,
  columns: ColumnInfo[],
): BuildBuilderToken {
  if (node.kind === 'operator' && node.name === 'OPERATOR_COALESCE') {
    return parsedBuildExpression(
      { ...node, kind: 'function', name: 'coalesce', distinct: false, window: false },
      columns,
    );
  }
  const id = crypto.randomUUID();
  const fallback = (): BuildBuilderToken => ({
    id,
    kind: 'sql',
    expression: node.sql,
    operations: [],
  });
  const combined = (
    combination: BuildCombination,
    children: ParsedExpression[],
  ): BuildBuilderToken => {
    const result: BuildBuilderToken = {
      id,
      kind: 'combination',
      combination,
      children: children.map((child) => parsedBuildExpression(child, columns)),
      operations: [],
    };
    try {
      partChain(result, columns);
      return result;
    } catch {
      // Valid native variants outside the visual catalogue remain executable SQL.
      return fallback();
    }
  };
  if (node.kind === 'column' && node.names.length === 1 && node.names[0])
    return {
      id,
      kind: 'column',
      column: resolveColumnName(
        node.names[0],
        columns.map((column) => column.name),
      ),
      operations: [],
    };
  const value = literalValue(node);
  if (value)
    return { id, kind: 'literal', literalType: value.type, value: value.value, operations: [] };

  const append = (input: ParsedExpression, operation: BuildOperation): BuildBuilderToken | null => {
    const base = parsedBuildExpression(input, columns);
    const next = { ...base, operations: [...base.operations, operation] };
    try {
      partChain(next, columns);
      return next;
    } catch {
      return null;
    }
  };
  if (node.kind === 'operator') {
    const kind = unaryOperators[node.name];
    const child = node.children[0];
    if (kind && child && node.children.length === 1)
      return append(child, { kind, arguments: {} }) ?? fallback();
    if (node.name === 'COMPARE_NOT_DISTINCT_FROM' && node.children.length === 2) {
      const [left, right] = node.children;
      const boolean = right && literalValue(right);
      if (
        left?.kind === 'cast' &&
        left.target === 'BOOLEAN' &&
        !left.try_cast &&
        boolean?.type === 'boolean'
      )
        return (
          append(left.child, {
            kind: boolean.value === 'true' ? 'is_true' : 'is_false',
            arguments: {},
          }) ?? fallback()
        );
    }
    const combination = numericOperators[node.name];
    if (combination && node.children.length >= 2)
      return combined({ kind: combination, separator: '' }, node.children);
  }

  const call = node.kind === 'scalar_query' ? node.child : node;
  if (node.kind === 'scalar_query' && call.kind === 'function' && call.window) return fallback();
  const summary: BuildOperation['summary'] =
    node.kind === 'scalar_query'
      ? { kind: 'scalar', source: node.source }
      : call.kind === 'function' && call.window
        ? { kind: 'window' }
        : undefined;
  if (call.kind === 'function') {
    for (const kind of operationKinds) {
      const definition = operationDefinition(kind);
      if (Boolean(definition.summary) !== Boolean(summary)) continue;
      let children = call.children;
      let name = definition.syntax?.name ?? definition.functionName;
      if (['count', 'count_distinct', 'count_null', 'count_true', 'count_false'].includes(kind)) {
        name = kind === 'count' || kind === 'count_distinct' ? 'count' : 'countif';
        if (kind === 'count_null' || kind === 'count_false') {
          const child = children[0];
          if (
            child?.kind !== 'operator' ||
            child.children.length !== 1 ||
            child.name !== (kind === 'count_null' ? 'OPERATOR_IS_NULL' : 'OPERATOR_NOT')
          )
            continue;
          children = child.children;
        }
      }
      if (call.name !== name || call.distinct !== (kind === 'count_distinct')) continue;
      const inputIndex = definition.syntax?.input ?? 0;
      const input = children[inputIndex];
      if (!input) continue;
      const base = parsedBuildExpression(input, columns);
      let type: BuildType;
      try {
        type = partChain(base, columns).type;
      } catch {
        continue;
      }
      const parameters = definition.syntax?.args ?? [];
      const args = children.filter((_, index) => index !== inputIndex);
      if (
        args.length > parameters.length ||
        args.length < parameters.filter((p) => !p.optional).length
      )
        continue;
      const operation: BuildOperation = { kind, arguments: {}, ...(summary ? { summary } : {}) };
      let valid = true;
      for (const [index, parameter] of parameters.entries()) {
        const arg = args[index];
        if (!arg && parameter.optional) {
          operation.arguments[parameter.name] = '';
          continue;
        }
        const value = arg && literalValue(arg);
        const expected =
          parameter.type === 'element'
            ? type.family === 'list'
              ? type.element.family
              : 'unknown'
            : parameter.type === 'scalar'
              ? type.family
              : parameter.type;
        const literalType = ['number', 'boolean'].includes(expected) ? expected : 'text';
        if (value?.type !== literalType) {
          valid = false;
          break;
        }
        operation.arguments[parameter.name] = value.value;
      }
      if (valid) {
        const result = append(input, operation);
        if (result) return result;
      }
    }
  }
  if (node.kind === 'function' && !node.window && !node.distinct) {
    const kind = functions[node.name];
    const separator = kind === 'text' ? literalValue(node.children[0]) : null;
    if (kind && (kind !== 'text' || separator?.type === 'text')) {
      const children = kind === 'text' ? node.children.slice(1) : node.children;
      if (children.length) return combined({ kind, separator: separator?.value ?? '' }, children);
    }
  }
  return fallback();
}
function literalValue(
  node?: ParsedExpression,
): { type: 'text' | 'number' | 'boolean' | 'null'; value: string } | null {
  if (node?.kind === 'literal') return { type: node.literal_type, value: node.value };
  if (
    node?.kind === 'cast' &&
    !node.try_cast &&
    node.target === 'BOOLEAN' &&
    node.child.kind === 'literal' &&
    node.child.literal_type === 'text' &&
    ['t', 'f'].includes(node.child.value)
  )
    return { type: 'boolean', value: node.child.value === 't' ? 'true' : 'false' };
  if (node?.kind === 'operator' && ['-', '+'].includes(node.name) && node.children.length === 1) {
    const child = node.children[0];
    if (child?.kind === 'literal' && child.literal_type === 'number')
      return { type: 'number', value: `${node.name}${child.value}` };
  }
  return null;
}
