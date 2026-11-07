import { describe, expect, it } from 'vitest';

import type { WorkspaceNodeInfo } from '@/api';
import { ancestorIds, referenceOptions } from '../trendsReference';

const node = (id: string, name: string, parent_ids: string[] = []): WorkspaceNodeInfo =>
  ({
    id,
    name,
    parent_ids,
    child_ids: [],
    provenance: { type: 'source' },
    derivation_description: '',
    can_undo: false,
    can_redo: false,
  }) as unknown as WorkspaceNodeInfo;

// corpus -> women (filter) -> matches (Concordance); sibling: men.
const nodes = [
  node('corpus', 'Hansard'),
  node('women', 'Women', ['corpus']),
  node('men', 'Men', ['corpus']),
  node('matches', 'jobs matches', ['women']),
  node('other', 'Another corpus'),
];

describe('ancestorIds', () => {
  it('walks every Data Block a Data Block was made from', () => {
    expect(ancestorIds(nodes, 'matches')).toEqual(new Set(['women', 'corpus']));
    expect(ancestorIds(nodes, 'corpus')).toEqual(new Set());
  });
});

describe('referenceOptions', () => {
  it('lists the lineage first, nearest first, then the rest by name', () => {
    expect(referenceOptions(nodes, 'matches')).toEqual([
      { id: 'women', name: 'Women', ancestor: true },
      { id: 'corpus', name: 'Hansard', ancestor: true },
      { id: 'other', name: 'Another corpus', ancestor: false },
      { id: 'men', name: 'Men', ancestor: false },
    ]);
  });

  it('never offers the Data Block itself', () => {
    expect(referenceOptions(nodes, 'corpus').map((option) => option.id)).not.toContain('corpus');
  });
});
