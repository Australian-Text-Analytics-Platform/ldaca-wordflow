import type { DependencyGraph } from './api';
import { targetKey, type ObjectRef } from './objects';

/** SQL dependents join a selection; logical graph links do not imply ownership. */
export function dependentSelection(graph: DependencyGraph, roots: ObjectRef[], reverse = false) {
  const selected = new Set(roots.map(targetKey));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      const from = reverse ? edge.target : edge.source;
      const to = reverse ? edge.source : edge.target;
      if (selected.has(targetKey(from)) && !selected.has(targetKey(to))) {
        selected.add(targetKey(to));
        changed = true;
      }
    }
  }
  return graph.nodes
    .filter((node) => selected.has(targetKey(node.object)))
    .map((node) => node.object);
}
