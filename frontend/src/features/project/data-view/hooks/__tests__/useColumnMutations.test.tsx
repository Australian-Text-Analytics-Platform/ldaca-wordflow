import { ProjectError } from '@/features/project/api';
const needsFormat = () =>
  new ProjectError(
    'Enter a format',
    JSON.stringify({ error: { code: 'datetime_format_required' } }),
  );
import { act, renderHook, waitFor } from '@testing-library/react';
import { Field, Int64, TimestampMillisecond, Utf8 } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
const Wrapper = ({ children }: { children: ReactNode }) => {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

import { useColumnMutations } from '../useColumnMutations';

describe('useColumnMutations', () => {
  beforeEach(() => {
    toastMock.error.mockReset();
  });

  it('opens the format modal only when automatic conversion needs help', async () => {
    const onCast = vi.fn().mockRejectedValueOnce(needsFormat()).mockResolvedValue(undefined);
    const initialField = new Field('published_at', new Utf8());
    const datetimeField = new Field('published_at', new TimestampMillisecond());
    const { result, rerender } = renderHook(
      ({ fields }) =>
        useColumnMutations({
          columnFields: fields,
          onCast,
          onError: toastMock.error,
        }),
      { wrapper: Wrapper, initialProps: { fields: { published_at: initialField } } },
    );

    await waitFor(() => {
      expect(result.current.columnFields.published_at).toBe(initialField);
    });

    act(() => {
      result.current.handleTypeChange('published_at', 'datetime');
    });
    await waitFor(() =>
      expect(result.current.datetimeModal).toMatchObject({
        column: 'published_at',
        targetType: 'datetime',
      }),
    );
    expect(onCast).toHaveBeenCalledWith('published_at', 'datetime', undefined);
    expect(toastMock.error).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDatetimeFormatConfirm('%Y-%m-%d');
    });

    await waitFor(() => {
      expect(onCast).toHaveBeenCalledWith('published_at', 'datetime', '%Y-%m-%d');
    });
    rerender({ fields: { published_at: datetimeField } });
    expect(result.current.columnFields.published_at).toBe(datetimeField);
    expect(result.current.datetimeModal).toBeNull();
  });

  it('reports cast failures without leaving a column marked busy', async () => {
    const onCast = vi.fn().mockRejectedValue(new Error('invalid date'));
    const publishedAt = new Field('published_at', new Utf8());
    const { result } = renderHook(
      () =>
        useColumnMutations({
          columnFields: { published_at: publishedAt },
          onCast,
          onError: toastMock.error,
        }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.handleTypeChange('published_at', 'integer');
    });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'invalid date' }),
      );
      expect(result.current.loadingCast).toEqual({});
    });
  });

  it('renames and deletes columns through the edit callbacks', async () => {
    const onRenameColumn = vi.fn().mockResolvedValue(undefined);
    const onDeleteColumn = vi.fn().mockResolvedValue(undefined);
    const title = new Field('title', new Utf8());
    const count = new Field('count', new Int64());
    const { result } = renderHook(
      () =>
        useColumnMutations({
          columnFields: { title, count },
          onRenameColumn,
          onDeleteColumn,
          onError: toastMock.error,
        }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.startRename('title');
    });
    await act(async () => {
      await result.current.submitRename('title', 'heading');
    });
    expect(onRenameColumn).toHaveBeenCalledWith('title', 'heading');
    expect(result.current.renamingColumn).toBeNull();

    act(() => {
      result.current.requestDeleteColumn('count');
    });
    expect(result.current.deleteColumnDialogOpen).toBe(true);
    await act(async () => {
      await result.current.confirmDeleteColumn();
    });
    expect(onDeleteColumn).toHaveBeenCalledWith('count');
    expect(result.current.deleteColumnDialogOpen).toBe(false);
    expect(result.current.columnFields.count).toBe(count); // Schema remains owned by the parent query.
  });
});

it('represents every pending cast and keeps its captured target through dialog confirmation', async () => {
  const releases: (() => void)[] = [];
  const first = vi
    .fn(() => new Promise<void>((resolve) => releases.push(resolve)))
    .mockRejectedValueOnce(needsFormat());
  const second = vi.fn(async () => undefined);
  const field = new Field('published_at', new Utf8());
  const { result, rerender } = renderHook(
    ({ onCast }) =>
      useColumnMutations({
        columnFields: { published_at: field },
        onCast,
        onError: toastMock.error,
      }),
    { wrapper: Wrapper, initialProps: { onCast: first } },
  );
  act(() => {
    result.current.handleTypeChange('published_at', 'datetime');
  });
  await waitFor(() => expect(result.current.datetimeModal).not.toBeNull());
  first.mockClear();
  rerender({ onCast: second });
  act(() => {
    void result.current.handleDatetimeFormatConfirm('%Y-%m-%d');
  });
  await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
  expect(second).not.toHaveBeenCalled();
  rerender({ onCast: first });
  act(() => result.current.handleTypeChange('published_at', 'integer'));
  await waitFor(() => expect(first).toHaveBeenCalledTimes(2));
  await act(async () => releases[0]!());
  expect(result.current.loadingCast.published_at).toBe(true);
  await act(async () => releases[1]!());
  await waitFor(() => expect(result.current.loadingCast).toEqual({}));
});

it('lets DuckDB decide column name collisions and permits timezone target changes', async () => {
  const onRenameColumn = vi.fn().mockRejectedValue(new Error('duplicate column name'));
  const onCast = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  const { result } = renderHook(
    () =>
      useColumnMutations({
        columnFields: {
          source: new Field('source', new TimestampMillisecond()),
          taken: new Field('taken', new Utf8()),
        },
        onRenameColumn,
        onCast,
        onError,
      }),
    { wrapper: Wrapper },
  );
  await act(async () => {
    await result.current.submitRename('source', 'taken');
  });
  expect(onRenameColumn).toHaveBeenCalledWith('source', 'taken');
  expect(onError).toHaveBeenCalledOnce();
  act(() => {
    result.current.handleTypeChange('source', { sqlType: 'TIMESTAMPTZ' });
  });
  await waitFor(() =>
    expect(onCast).toHaveBeenCalledWith('source', { sqlType: 'TIMESTAMPTZ' }, undefined),
  );
});

it('retains SQL type drafts after failure and captures their original Data Block', async () => {
  const first = vi
    .fn()
    .mockRejectedValueOnce(new Error('invalid type'))
    .mockResolvedValue(undefined);
  const second = vi.fn();
  const onError = vi.fn();
  const { result, rerender } = renderHook(
    ({ nodeName, onCast }) => useColumnMutations({ nodeName, columnFields: {}, onCast, onError }),
    { wrapper: Wrapper, initialProps: { nodeName: 'original', onCast: first } },
  );
  act(() => result.current.requestSqlType('amount'));
  rerender({ nodeName: 'other', onCast: second });
  await act(async () => result.current.confirmSqlType('unknown_type'));
  expect(onError).toHaveBeenCalledOnce();
  expect(result.current.sqlTypeModal?.nodeName).toBe('original');
  await act(async () => result.current.confirmSqlType('DECIMAL(18,4)'));
  expect(first).toHaveBeenLastCalledWith('amount', { sqlType: 'DECIMAL(18,4)' }, undefined);
  expect(second).not.toHaveBeenCalled();
  expect(result.current.sqlTypeModal).toBeNull();
});

it('does not close a newly opened SQL type dialog when an older cast finishes', async () => {
  let release!: () => void;
  const onCast = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const { result } = renderHook(
    () => useColumnMutations({ columnFields: {}, onCast, onError: vi.fn() }),
    { wrapper: Wrapper },
  );
  act(() => result.current.requestSqlType('first'));
  let completion!: Promise<void>;
  act(() => {
    completion = result.current.confirmSqlType('INTEGER');
  });
  await waitFor(() => expect(onCast).toHaveBeenCalledOnce());
  act(() => {
    result.current.closeSqlTypeModal();
    result.current.requestSqlType('second');
  });
  await act(async () => {
    release();
    await completion;
  });
  expect(result.current.sqlTypeModal?.column).toBe('second');
});

it('keeps a manual datetime dialog open on failure and closes only on success', async () => {
  const failure = new Error('Invalid format');
  const onCast = vi
    .fn()
    .mockRejectedValueOnce(needsFormat())
    .mockRejectedValueOnce(failure)
    .mockResolvedValue(undefined);
  const onError = vi.fn();
  const { result } = renderHook(
    () =>
      useColumnMutations({
        columnFields: { stamp: new Field('stamp', new Utf8()) },
        onCast,
        onError,
      }),
    { wrapper: Wrapper },
  );
  act(() => result.current.handleTypeChange('stamp', 'datetime'));
  await waitFor(() => expect(result.current.datetimeModal).not.toBeNull());
  expect(onError).not.toHaveBeenCalled();
  await act(() => result.current.handleDatetimeFormatConfirm('%Y'));
  expect(result.current.datetimeModal).not.toBeNull();
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  await act(() => result.current.handleDatetimeFormatConfirm('%d/%m/%Y'));
  expect(result.current.datetimeModal).toBeNull();
});

it('does not open a dialog after successful automatic datetime conversion', async () => {
  const onCast = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(
    () =>
      useColumnMutations({
        columnFields: { stamp: new Field('stamp', new Utf8()) },
        onCast,
        onError: vi.fn(),
      }),
    { wrapper: Wrapper },
  );
  act(() => result.current.handleTypeChange('stamp', 'datetime'));
  await waitFor(() => expect(onCast).toHaveBeenCalledWith('stamp', 'datetime', undefined));
  expect(result.current.datetimeModal).toBeNull();
});
