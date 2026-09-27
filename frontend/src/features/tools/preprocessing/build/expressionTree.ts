import type { BuildBuilderToken } from './hooks/buildExpressionModel';

export function findExpression(
  nodes: BuildBuilderToken[],
  id: string,
): BuildBuilderToken | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.kind === 'combination') {
      const found = findExpression(node.children, id);
      if (found) return found;
    }
  }
}
export function updateExpression(
  nodes: BuildBuilderToken[],
  id: string,
  update: (node: BuildBuilderToken) => BuildBuilderToken,
): BuildBuilderToken[] {
  return nodes.map((node) =>
    node.id === id
      ? update(node)
      : node.kind === 'combination'
        ? { ...node, children: updateExpression(node.children, id, update) }
        : node,
  );
}
export function removeExpression(nodes: BuildBuilderToken[], id: string): BuildBuilderToken[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.kind === 'combination'
        ? { ...node, children: removeExpression(node.children, id) }
        : node,
    );
}
export function insertExpression(
  nodes: BuildBuilderToken[],
  parent: string | null,
  index: number,
  expression: BuildBuilderToken,
): BuildBuilderToken[] {
  if (parent === null) return nodes.toSpliced(index, 0, expression);
  return updateExpression(nodes, parent, (node) =>
    node.kind === 'combination'
      ? { ...node, children: node.children.toSpliced(index, 0, expression) }
      : node,
  );
}
function expressionLocation(
  nodes: BuildBuilderToken[],
  id: string,
  parent: string | null = null,
): { parent: string | null; index: number } | null {
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return { parent, index };
    if (node.kind === 'combination') {
      const result = expressionLocation(node.children, id, node.id);
      if (result) return result;
    }
  }
  return null;
}
export function moveExpression(
  nodes: BuildBuilderToken[],
  id: string,
  parent: string | null,
  index: number,
): BuildBuilderToken[] {
  if (parent !== null && findExpression(nodes, parent)?.kind !== 'combination') return nodes;
  const expression = findExpression(nodes, id);
  const from = expressionLocation(nodes, id);
  if (!expression || !from || (parent !== null && findExpression([expression], parent)))
    return nodes;
  const slot = from.parent === parent && from.index < index ? index - 1 : index;
  return insertExpression(removeExpression(nodes, id), parent, slot, expression);
}
