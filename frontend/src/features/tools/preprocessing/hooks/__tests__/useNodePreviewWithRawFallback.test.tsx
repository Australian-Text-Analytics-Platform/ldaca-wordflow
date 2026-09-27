import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the options each call passes to usePreprocessingPreview so we can
// assert on the structured identity and fetcher routing without firing timers.
interface CapturedOptions {
  identity: {
    projectBase: string;
    operation: string;
    nodeIds: string[];
  } | null;
  request: unknown;
  fetcher: (params: {
    request: { projectBase: string; nodeId: string; payload: unknown };
    page: number;
    pageSize: number;
    signal: AbortSignal;
  }) => Promise<unknown>;
  debounceMs?: number;
}

const usePreprocessingPreviewMock = vi.hoisted(() =>
  vi.fn<(options: CapturedOptions) => Record<string, unknown>>(),
);

vi.mock('../usePreprocessingPreview', () => ({
  usePreprocessingPreview: usePreprocessingPreviewMock,
}));

const queryProjectSqlTableMock = vi.hoisted(() => vi.fn());
vi.mock('../../projectPreprocessing', () => ({ previewSql: queryProjectSqlTableMock }));

import { useNodePreviewWithRawFallback } from '../useNodePreviewWithRawFallback';

/**
 * Returns the latest mocked preview options so tests can inspect routing.
 */
const lastCapturedOptions = (): CapturedOptions => {
  const calls = usePreprocessingPreviewMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0];
};

describe('useNodePreviewWithRawFallback', () => {
  beforeEach(() => {
    usePreprocessingPreviewMock.mockReset();
    queryProjectSqlTableMock.mockReset();
    usePreprocessingPreviewMock.mockReturnValue({});
  });

  describe('identity + request shape', () => {
    it('uses a null identity and request when no node is selected', () => {
      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: null,
          operationPayload: { regex: 'x' },
          operationFetch: vi.fn(),
          operation: 'replace',
        }),
      );

      const opts = lastCapturedOptions();
      expect(opts.identity).toBeNull();
      expect(opts.request).toBeNull();
    });

    it('indexes a raw preview by operation, Project, and Data Block', () => {
      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: 'node-1',
          operationPayload: null,
          operationFetch: vi.fn(),
          operation: 'filter',
        }),
      );

      const opts = lastCapturedOptions();
      expect(opts.identity).toEqual({
        projectBase: '',
        operation: 'filter',
        nodeIds: ['node-1'],
      });
      expect(opts.request).toEqual({ projectBase: '', nodeId: 'node-1', payload: null });
    });

    it('keeps the operation payload structured in the request', () => {
      const payload = { conditions: [{ column: 'id', op: '>', value: 5 }] };
      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: 'node-1',
          operationPayload: payload,
          operationFetch: vi.fn(),
          operation: 'filter',
        }),
      );

      const opts = lastCapturedOptions();
      expect(opts.identity).toEqual({
        projectBase: '',
        operation: 'filter',
        nodeIds: ['node-1'],
      });
      expect(opts.request).toEqual({ projectBase: '', nodeId: 'node-1', payload });
    });

    it('treats enabled=false the same as no node', () => {
      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: 'node-1',
          operationPayload: { foo: 'bar' },
          operationFetch: vi.fn(),
          operation: 'filter',
          enabled: false,
        }),
      );

      const opts = lastCapturedOptions();
      expect(opts.identity).toBeNull();
      expect(opts.request).toBeNull();
    });
  });

  describe('fetcher routing', () => {
    it('routes through operationFetch when the payload is present', async () => {
      const operationFetch = vi.fn().mockResolvedValue({
        data: [{ a: 1 }],
        columns: ['a'],
        pagination: { page: 2, page_size: 25, has_next: false },
      });

      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: 'node-1',
          operationPayload: { conditions: [] },
          operationFetch,
          operation: 'filter',
        }),
      );

      const opts = lastCapturedOptions();
      const signal = new AbortController().signal;
      const result = await opts.fetcher({
        request: { projectBase: '', nodeId: 'node-1', payload: { conditions: [] } },
        page: 2,
        pageSize: 25,
        signal,
      });

      expect(operationFetch).toHaveBeenCalledWith({
        projectBase: '',
        nodeId: 'node-1',
        payload: { conditions: [] },
        page: 2,
        pageSize: 25,
        signal,
      });
      expect(queryProjectSqlTableMock).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: [{ a: 1 }],
        columns: ['a'],
        pagination: { page: 2, page_size: 25, has_next: false },
      });
    });

    it('falls back to explicit node data when the payload is null', async () => {
      const operationFetch = vi.fn();
      queryProjectSqlTableMock.mockResolvedValue({
        data: [{ raw: 1 }],
        columns: ['raw'],
        pagination: { page: 1, page_size: 10, has_next: false },
      });

      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: 'node-1',
          operationPayload: null,
          operationFetch,
          operation: 'filter',
        }),
      );

      const opts = lastCapturedOptions();
      const signal = new AbortController().signal;
      const result = await opts.fetcher({
        request: { projectBase: '', nodeId: 'node-1', payload: null },
        page: 1,
        pageSize: 10,
        signal,
      });

      expect(operationFetch).not.toHaveBeenCalled();
      expect(queryProjectSqlTableMock).toHaveBeenCalledWith(
        '',
        'SELECT * FROM data."node-1"',
        1,
        10,
        signal,
      );
      expect(result).toEqual({
        data: [{ raw: 1 }],
        columns: ['raw'],
        pagination: { page: 1, page_size: 10, has_next: false },
      });
    });
  });

  describe('debounce passthrough', () => {
    it('forwards an explicit debounceMs to usePreprocessingPreview', () => {
      renderHook(() =>
        useNodePreviewWithRawFallback({
          projectBase: '',
          nodeId: 'node-1',
          operationPayload: null,
          operationFetch: vi.fn(),
          operation: 'filter',
          debounceMs: 50,
        }),
      );

      const opts = lastCapturedOptions();
      expect(opts.debounceMs).toBe(50);
    });
  });
});
