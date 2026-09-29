import { describe, expect, it } from 'vitest';
import type { UserFileImport } from '@/api';
import { importOutcomeMessage, importToTask } from '../taskProjection';

const importResource = (overrides: Partial<UserFileImport>): UserFileImport =>
  ({
    availability: 'available',
    id: 'import-1',
    request: { kind: 'sample', collection_id: 'ADO/reddit' },
    state: 'succeeded',
    progress: { fraction: 1, message: null },
    cancellation_requested_at: null,
    error: null,
    result: {
      kind: 'sample',
      collection_id: 'ADO/reddit',
      destination_path: 'sample_data/ADO/reddit',
      file_count: 12,
      bytes_written: 48 * 1024 * 1024,
    },
    created_at: '2026-09-29T00:00:00Z',
    started_at: '2026-09-29T00:00:01Z',
    finished_at: '2026-09-29T00:00:09Z',
    revision: 3,
    ...overrides,
  }) as UserFileImport;

describe('import tasks (issue 235)', () => {
  it('states a finished import in plain words and keeps its folder', () => {
    const task = importToTask(importResource({}));
    expect(task.message).toBe('Imported 12 files (48 MB) to sample_data/ADO/reddit');
    expect(task.resource_type === 'user_file_import' && task.outcome).toEqual({
      destination_path: 'sample_data/ADO/reddit',
      file_count: 12,
      bytes_written: 48 * 1024 * 1024,
    });
  });

  it('has no outcome while running', () => {
    const task = importToTask(
      importResource({ state: 'running', finished_at: null, result: null }),
    );
    expect(task.resource_type === 'user_file_import' && task.outcome).toBeNull();
  });

  it('writes one file in the singular', () => {
    expect(
      importOutcomeMessage({ destination_path: 'data', file_count: 1, bytes_written: 2048 }),
    ).toBe('Imported 1 file (2.0 KB) to data');
  });
});
