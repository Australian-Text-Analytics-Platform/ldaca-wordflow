import { describe, expect, it } from 'vitest';

import type { ProjectGraphNode } from '@/api';
import { toProjectGraphNodeCard } from '../graphNodeModel';

const graphNode = (shape?: ProjectGraphNode['shape']): ProjectGraphNode => ({
  id: 'node-1',
  name: 'Joined data',
  provenance: { type: 'source' },
  derivation_description: 'source snapshot',
  shape,
  can_undo: false,
  can_redo: false,
});

describe('toProjectGraphNodeCard', () => {
  it('projects the complete Data Block shape returned by the graph query', () => {
    expect(toProjectGraphNodeCard(graphNode([2380, 21])).shape).toEqual([2380, 21]);
  });

  it('retains the unknown fallback when node metadata omits shape', () => {
    expect(toProjectGraphNodeCard(graphNode()).shape).toEqual([null, null]);
  });
});
