import { renderHook } from '@testing-library/react';
import { Field, Utf8 } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const previewNodeCreationTableMock = vi.hoisted(() => vi.fn());
const usePreprocessingPreviewMock = vi.hoisted(() => vi.fn());

vi.mock('../../projectPreprocessing', () => ({ previewSql: previewNodeCreationTableMock }));

vi.mock('../../hooks/usePreprocessingPreview', () => ({
  usePreprocessingPreview: usePreprocessingPreviewMock,
}));

import { useConcatSubTab } from '../../concat/hooks/useConcatSubTab';
import { useJoinSubTab } from '../../join/hooks/useJoinSubTab';
import { inputNode as projectNodeMetadata } from '@/test/nodeMetadata';

const previewState = {
  data: [],
  columns: [],
  pagination: null,
  loading: false,
  error: null,
  ready: true,
  page: 1,
  pageSize: 10,
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  refresh: vi.fn(),
};

describe('direct preprocessing preview adapters', () => {
  beforeEach(() => {
    previewNodeCreationTableMock.mockReset();
    usePreprocessingPreviewMock.mockReset();
    usePreprocessingPreviewMock.mockReturnValue(previewState);
  });

  it('maps the Join request project and exact signal to the generated client', async () => {
    previewNodeCreationTableMock.mockResolvedValue({ rows: [], columns: [], hasNext: false });
    renderHook(() =>
      useJoinSubTab({
        left: { node_id: 'left', column: 'id' },
        right: { node_id: 'right', column: 'id' },
        projectBase: 'closure-project',
        joinNodes: vi.fn(),
        isLoading: { operations: false },
        onAlert: vi.fn(),
      }),
    );

    const fetcher = usePreprocessingPreviewMock.mock.calls[0]?.[0].fetcher as (args: {
      request: {
        projectBase: string;
        left: { node_id: string; column: string };
        right: { node_id: string; column: string };
        kind: 'left';
      };
      page: number;
      pageSize: number;
      signal: AbortSignal;
    }) => Promise<unknown>;
    const signal = new AbortController().signal;
    await fetcher({
      request: {
        projectBase: 'request-project',
        left: { node_id: 'left', column: 'id' },
        right: { node_id: 'right', column: 'id' },
        kind: 'left',
      },
      page: 2,
      pageSize: 25,
      signal,
    });

    expect(previewNodeCreationTableMock).toHaveBeenCalledWith(
      'request-project',
      expect.stringContaining('LEFT JOIN'),
      2,
      25,
      signal,
    );
  });

  it('maps the Stack request project and exact signal to its project action', async () => {
    const concatPreview = vi.fn().mockResolvedValue({ data: [], columns: [], pagination: null });
    const projectNodes = [
      projectNodeMetadata({ id: 'node-1', name: 'One' }),
      projectNodeMetadata({ id: 'node-2', name: 'Two' }),
    ];

    renderHook(() =>
      useConcatSubTab({
        selectedNodeIds: ['node-1', 'node-2'],
        projectBase: 'closure-project',
        projectNodes,
        getColumnInfos: () => [
          { name: 'id', typeName: 'Utf8', field: new Field('id', new Utf8()) },
        ],
        concatPreview,
        concatNodes: vi.fn(),
        isLoading: { operations: false },
        onAlert: vi.fn(),
      }),
    );

    const fetcher = usePreprocessingPreviewMock.mock.calls[0]?.[0].fetcher as (args: {
      request: { projectBase: string; nodeIds: string[]; deduplicate: boolean };
      page: number;
      pageSize: number;
      signal: AbortSignal;
    }) => Promise<unknown>;
    const signal = new AbortController().signal;
    await fetcher({
      request: {
        projectBase: 'request-project',
        nodeIds: ['node-1', 'node-2'],
        deduplicate: true,
      },
      page: 2,
      pageSize: 25,
      signal,
    });

    expect(concatPreview).toHaveBeenCalledWith({
      projectBase: 'request-project',
      nodeIds: ['node-1', 'node-2'],
      deduplicate: true,
      page: 2,
      pageSize: 25,
      signal,
    });
  });
});
