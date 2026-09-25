import { describe, expect, it } from 'vitest';
import { buildDedupeBodies } from '../../dedupe/dedupeModel';
import { buildSegmentBody } from '../../segment/segmentModel';
import { groupBlockName, groupCountSql, MAX_GROUPS, toGroups } from '../../split-group/splitGroups';
import { buildGroupSummaryBody, defaultSummary } from '../../summarise/groupSummaryModel';
import type { BuilderInput } from '../builderTypes';

const input: BuilderInput = {
  id: 'node-1',
  name: 'posts',
  column: 'text',
  columns: [
    { name: 'id', kind: 'number' },
    { name: 'party', kind: 'text' },
    { name: 'text', kind: 'text' },
    { name: 'created', kind: 'date' },
  ],
};

describe('Data Builder request models (issues 148 to 151)', () => {
  it('builds segment requests, requiring a pattern and a fresh lead column', () => {
    const form = {
      unit: 'sentence' as const,
      pattern: '',
      lead: 'column' as const,
      leadColumn: 'speaker',
      name: '',
    };
    expect(buildSegmentBody(input, form)).toEqual({
      kind: 'segment',
      source_node_id: 'node-1',
      column: 'text',
      unit: 'sentence',
      name: undefined,
    });
    expect(buildSegmentBody(input, { ...form, unit: 'pattern' })).toBeNull();
    expect(
      buildSegmentBody(input, { ...form, unit: 'pattern', pattern: '^\\w+:', leadColumn: 'party' }),
    ).toBeNull();
    expect(buildSegmentBody(input, { ...form, unit: 'pattern', pattern: '^\\w+:' })).toMatchObject({
      lead: 'column',
      lead_column: 'speaker',
    });
    expect(
      buildSegmentBody(input, { ...form, unit: 'pattern', pattern: ',', lead: 'drop' }),
    ).toMatchObject({ lead: 'drop' });
  });

  it('summarises with cautious defaults: join the text, keep date ranges, leave the rest out', () => {
    expect(defaultSummary({ name: 'text', kind: 'text' }, 'text')).toBe('join_text');
    expect(defaultSummary({ name: 'created', kind: 'date' }, 'text')).toBe('earliest_latest');
    expect(defaultSummary({ name: 'id', kind: 'number' }, 'text')).toBe('leave');
    expect(
      buildGroupSummaryBody(input, { groupBy: [], choices: {}, separator: '\n\n', name: '' }),
    ).toBeNull();
    expect(
      buildGroupSummaryBody(input, {
        groupBy: ['party'],
        choices: { id: 'sum' },
        separator: ' | ',
        name: 'by party',
      }),
    ).toEqual({
      kind: 'group_summary',
      source_node_id: 'node-1',
      group_by: ['party'],
      summaries: [
        { column: 'id', summary: 'sum' },
        { column: 'text', summary: 'join_text', separator: ' | ' },
        { column: 'created', summary: 'earliest_latest' },
      ],
      name: 'by party',
    });
  });

  it('always compares the deduplicating column, plus any additional columns (issue 158)', () => {
    const form = { additional: [], nearText: false, ignoreLinks: true, name: '' };
    expect(buildDedupeBodies(input, form)).toEqual({
      kept: expect.objectContaining({
        columns: ['text'],
        near_text_column: null,
        ignore_links_mentions: false,
        output: 'kept',
        name: 'posts_deduplicated',
      }) as unknown,
      duplicates: expect.objectContaining({
        columns: ['text'],
        output: 'duplicates',
        name: 'posts_duplicates',
      }) as unknown,
    });
    // Additional columns follow the Data Block's order; "Select all" compares whole rows.
    expect(
      buildDedupeBodies(input, { ...form, additional: ['created', 'party', 'text', 'gone'] })?.kept,
    ).toMatchObject({ columns: ['text', 'party', 'created'] });
    expect(buildDedupeBodies(input, { ...form, nearText: true })?.kept).toMatchObject({
      columns: ['text'],
      near_text_column: 'text',
      ignore_links_mentions: true,
    });
    // Near-duplicate matching needs a text column, and a basis column is required.
    expect(
      buildDedupeBodies({ ...input, column: 'id' }, { ...form, nearText: true })?.kept,
    ).toMatchObject({ columns: ['id'], near_text_column: null });
    expect(buildDedupeBodies({ ...input, column: '' }, form)).toBeNull();
  });

  it('turns counted values, dates and ranges into filter groups', () => {
    expect(groupCountSql('n1', 'party', { kind: 'values' })).toContain('ORDER BY n DESC');
    expect(
      toGroups('party', { kind: 'values' }, [
        { value: 'Labor', n: 2 },
        { value: null, n: 1 },
      ]),
    ).toEqual([
      {
        key: 'v:Labor',
        label: 'Labor',
        rows: 2,
        conditions: [{ column: 'party', operator: 'eq', value: 'Labor' }],
      },
      {
        key: '__null__',
        label: '(empty)',
        rows: 1,
        conditions: [{ column: 'party', operator: 'is_null' }],
      },
    ]);
    expect(
      toGroups('created', { kind: 'dates', by: 'year_month' }, [{ value: '2020-12', n: 3 }])[0],
    ).toMatchObject({
      conditions: [
        { operator: 'gte', value: '2020-12-01T00:00:00Z' },
        { operator: 'lt', value: '2021-01-01T00:00:00Z' },
      ],
    });
    const bins = toGroups('id', { kind: 'bins', count: 2, low: 0, high: 10 }, [
      { value: 0, n: 4 },
      { value: 1, n: 3 },
      { value: 2, n: 1 },
    ]);
    // The maximum (bin index 2) closes the last range instead of opening a third.
    expect(bins.map((group) => [group.label, group.rows])).toEqual([
      ['0 to under 5', 4],
      ['5 to 10', 4],
    ]);
    expect(bins[1]?.conditions[1]).toEqual({ column: 'id', operator: 'lte', value: 10 });
    expect(MAX_GROUPS).toBe(50);
  });

  it('makes group names safe for Data Block names', () => {
    expect(groupBlockName('posts', 'a/b..c\u0007')).toBe('posts · a-b.c');
    expect(groupBlockName('posts', '   ')).toBe('posts · (blank)');
  });
});
