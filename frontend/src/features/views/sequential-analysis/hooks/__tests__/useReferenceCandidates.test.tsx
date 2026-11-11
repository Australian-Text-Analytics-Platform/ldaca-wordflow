import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { Field, Int64, TimestampMillisecond } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceNodeInfo } from '@/api';
import { getNodeSchemaTable } from '@/api/tableApi';
import { referenceOptions } from '../../trendsReference';
import { useReferenceCandidates } from '../useReferenceCandidates';

vi.mock('@/api/tableApi', () => ({ getNodeSchemaTable: vi.fn() }));

const node = (id: string, name: string, parent_ids: string[] = []): WorkspaceNodeInfo =>
  ({ id, name, parent_ids, child_ids: [] }) as unknown as WorkspaceNodeInfo;
const nodes = [
  node('matches', 'Matches', ['corpus']),
  node('corpus', 'Corpus'),
  node('honi', 'Honi Soit'),
];
const schemas: Record<string, { name: string; field: Field }[]> = {
  corpus: [{ name: 'created_utc', field: new Field('created_utc', new TimestampMillisecond()) }],
  honi: [{ name: 'year', field: new Field('year', new Int64()) }],
};

const renderCandidates = (timeColumn: string) =>
  renderHook(
    () =>
      useReferenceCandidates({
        workspaceId: 'w',
        nodes,
        activeNodeId: 'matches',
        timeColumn,
        columnType: 'datetime',
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    },
  );

describe('useReferenceCandidates', () => {
  beforeEach(() => {
    vi.mocked(getNodeSchemaTable).mockReset();
    vi.mocked(getNodeSchemaTable).mockImplementation(
      async (options) =>
        ({
          schema: schemas[(options as { path: { node_id: string } }).path.node_id] ?? [],
        }) as never,
    );
  });

  it('keeps every Data Block until their columns are known, then drops those without the time column', async () => {
    const { result } = renderCandidates('created_utc');
    expect(result.current.nodes.map((candidate) => candidate.id)).toEqual([
      'matches',
      'corpus',
      'honi',
    ]);
    expect(result.current.excluded.size).toBe(0);
    await waitFor(() => {
      expect(result.current.excluded).toEqual(new Set(['honi']));
    });
    // The analysed Data Block stays, so the picker can mark its lineage.
    expect(result.current.nodes.map((candidate) => candidate.id)).toEqual(['matches', 'corpus']);
    expect(referenceOptions(result.current.nodes, 'matches')).toEqual([
      { id: 'corpus', name: 'Corpus', ancestor: true },
    ]);
  });

  it('keeps every Data Block without a time column, reading none', () => {
    const { result } = renderCandidates('');
    expect(result.current.nodes.map((candidate) => candidate.id)).toEqual([
      'matches',
      'corpus',
      'honi',
    ]);
    expect(getNodeSchemaTable).not.toHaveBeenCalled();
  });
});
