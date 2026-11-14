import { describe, expect, it } from 'vitest';

import type { WorkspaceNodeInfo } from '@/api';
import { Field, Float64, Int64, Utf8, DateDay, TimestampMillisecond } from 'apache-arrow';
import {
  ancestorIds,
  defaultReferenceNode,
  referenceAxisMatches,
  referenceOptions,
} from '../trendsReference';

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

describe('referenceAxisMatches', () => {
  const column = (name: string, type: Int64 | Float64 | Utf8 | DateDay | TimestampMillisecond) => ({
    name,
    field: new Field(name, type),
  });

  it('needs the time column, binnable the same way', () => {
    expect(
      referenceAxisMatches(
        [column('created_utc', new TimestampMillisecond())],
        'created_utc',
        'datetime',
      ),
    ).toBe(true);
    // A Date against a date-time: both bin by calendar period.
    expect(
      referenceAxisMatches([column('created_utc', new DateDay())], 'created_utc', 'datetime'),
    ).toBe(true);
    expect(referenceAxisMatches([column('year', new Float64())], 'year', 'numeric')).toBe(true);
    expect(
      referenceAxisMatches([column('created_utc', new Utf8())], 'created_utc', 'datetime'),
    ).toBe(false);
    expect(referenceAxisMatches([column('year', new Int64())], 'created_utc', 'datetime')).toBe(
      false,
    );
  });

  it('is unknown until the columns are known', () => {
    expect(referenceAxisMatches(undefined, 'created_utc', 'datetime')).toBeNull();
  });
});

describe('ancestorIds', () => {
  it('walks every Data Block a Data Block was made from', () => {
    expect(ancestorIds(nodes, 'matches')).toEqual(new Set(['women', 'corpus']));
    expect(ancestorIds(nodes, 'corpus')).toEqual(new Set());
  });
});

describe('defaultReferenceNode', () => {
  it('starts with the Data Block this one was made from, or none', () => {
    expect(defaultReferenceNode(nodes, 'matches')?.id).toBe('women');
    expect(defaultReferenceNode(nodes, 'corpus')).toBeNull();
    expect(defaultReferenceNode([node('orphan', 'Orphan', ['gone'])], 'orphan')).toBeNull();
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
