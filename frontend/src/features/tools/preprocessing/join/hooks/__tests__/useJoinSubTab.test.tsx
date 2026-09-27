import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const previewNodeCreationTableMock = vi.hoisted(() => vi.fn());

vi.mock('../../../projectPreprocessing', () => ({ previewSql: previewNodeCreationTableMock }));

import { useJoinSubTab } from '../useJoinSubTab';

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
};

describe('useJoinSubTab preview adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    previewNodeCreationTableMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses request-owned projects and aborts the exact SDK signal on project switch', async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    previewNodeCreationTableMock
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({
        rows: [{ id: 2 }],
        columns: ['id'],
        hasNext: false,
      });

    const { rerender } = renderHook(
      ({ projectBase }) =>
        useJoinSubTab({
          left: { node_id: 'left', column: 'id' },
          right: { node_id: 'right', column: 'id' },
          projectBase,
          joinNodes: vi.fn(),
          isLoading: { operations: false },
          onAlert: vi.fn(),
        }),
      { initialProps: { projectBase: 'project-request-1' }, wrapper: createWrapper() },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const firstCall = previewNodeCreationTableMock.mock.calls[0]!;
    expect(firstCall[0]).toBe('project-request-1');
    expect(firstCall[1]).toContain('USING ("id")');
    const firstSignal = firstCall[4] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);
    rerender({ projectBase: 'project-request-2' });
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    const secondCall = previewNodeCreationTableMock.mock.calls[1]!;
    expect(secondCall[0]).toBe('project-request-2');
    expect(secondCall[4]).not.toBe(firstSignal);
    await act(async () => {
      resolveFirst?.({
        rows: [{ id: 1 }],
        columns: ['id'],
        hasNext: false,
      });
      await firstResponse;
    });
  });

  it.each(['loading', 'failed', 'empty'])(
    'permits self-join Apply while preview is %s',
    async (state) => {
      if (state === 'loading')
        previewNodeCreationTableMock.mockReturnValue(
          new Promise(() => {
            /* Remains pending to verify advisory previews. */
          }),
        );
      else if (state === 'failed')
        previewNodeCreationTableMock.mockRejectedValue(new Error('Preview unavailable'));
      else
        previewNodeCreationTableMock.mockResolvedValue({ data: [], columns: [], pagination: null });
      const joinNodes = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(
        () =>
          useJoinSubTab({
            left: { node_id: 'same table', column: 'id' },
            right: { node_id: 'same table', column: 'parent' },
            projectBase: 'project',
            joinNodes,
            isLoading: { operations: true },
            onAlert: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(result.current.apply.disabled).toBe(false);
      await act(async () => {
        await result.current.apply.run();
      });
      expect(joinNodes).toHaveBeenCalledWith(
        'same table',
        'same table',
        'left',
        ['id'],
        ['parent'],
        expect.any(String),
      );
      expect(previewNodeCreationTableMock.mock.calls[0]?.[1]).toContain('a."id" = b."parent"');
    },
  );
});
