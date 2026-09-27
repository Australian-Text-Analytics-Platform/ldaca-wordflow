import { describe, expect, it } from 'vitest';

import { columnMutationReducer, createColumnMutationState } from '../columnMutationState';

describe('columnMutationReducer', () => {
  it('tracks datetime dialog state without mirroring schema', () => {
    const requested = columnMutationReducer(createColumnMutationState(), {
      type: 'datetimeRequested',
      request: { column: 'created_at', targetType: 'datetime', execute: async () => undefined },
    });
    expect(requested.datetimeModal?.column).toBe('created_at');
    const closed = columnMutationReducer(requested, { type: 'datetimeClosed' });
    expect(closed.datetimeModal).toBeNull();
  });

  it('tracks rename and delete workflows independently from casts', () => {
    const renaming = columnMutationReducer(createColumnMutationState(), {
      type: 'renameStarted',
      column: 'title',
    });
    expect(renaming.renamingColumn).toBe('title');

    const deleting = columnMutationReducer(renaming, {
      type: 'deleteRequested',
      column: 'count',
    });
    expect(deleting.columnToDelete).toBe('count');

    expect(deleting.renamingColumn).toBe('title');
  });
});
