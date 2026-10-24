import { describe, expect, it } from 'vitest';
import { buildTaskRows, hasFinishedLoaderTasks, loaderTaskVisibility } from '../taskRows';

describe('buildTaskRows (issue 235)', () => {
  it('opens the folder of a finished import, and the Data Loader otherwise', () => {
    const rows = buildTaskRows(
      [
        {
          resource_type: 'user_file_import',
          task_id: 'done',
          task_type: 'sample_import',
          state: 'successful',
          outcome: { destination_path: 'sample_data/ADO', file_count: 4, bytes_written: 10 },
        },
        {
          resource_type: 'user_file_import',
          task_id: 'running',
          task_type: 'sample_import',
          state: 'running',
        },
      ],
      new Map(),
      new Map(),
    );
    const byKey = new Map(rows.map((row) => [row.key, row]));
    expect(byKey.get('done')?.label).toBe('L - Sample data import');
    expect(byKey.get('done')?.target).toEqual({ kind: 'data-loader', folder: 'sample_data/ADO' });
    expect(byKey.get('running')?.target).toEqual({ kind: 'data-loader' });
  });
});

describe('finished Data Loader tasks fade out (issue 440)', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const loader = (task_id: string, state: string, finished: number | null) =>
    ({
      resource_type: 'user_file_import',
      task_id,
      task_type: 'data_portal_import',
      state,
      finished_at: finished === null ? null : minutesAgo(finished),
    }) as const;

  it('shows a success for ten minutes, dims it in the last, then hides it; errors stay', () => {
    const tasks = [
      loader('fresh', 'successful', 2),
      loader('fading', 'successful', 9.5),
      loader('gone', 'successful', 11),
      loader('failed', 'failed', 60),
      loader('running', 'running', null),
      {
        resource_type: 'upload',
        task_id: 'upload',
        task_type: 'upload',
        state: 'successful',
        finished_at: minutesAgo(30),
      } as const,
    ];
    expect(loaderTaskVisibility(tasks[0], now)).toBe('shown');
    expect(loaderTaskVisibility(tasks[1], now)).toBe('fading');
    expect(loaderTaskVisibility(tasks[2], now)).toBe('hidden');

    const rows = buildTaskRows(tasks, new Map(), new Map(), now);
    expect(rows.map((row) => row.key).sort()).toEqual(['fading', 'failed', 'fresh', 'running']);
    expect(rows.find((row) => row.key === 'fading')?.fading).toBe(true);
    expect(rows.find((row) => row.key === 'fresh')?.fading).toBe(false);
    // Without a clock (older callers) everything shows.
    expect(buildTaskRows(tasks, new Map(), new Map())).toHaveLength(6);
  });

  it('offers Clear finished only when a finished import or upload exists', () => {
    expect(hasFinishedLoaderTasks([loader('running', 'running', null)])).toBe(false);
    expect(hasFinishedLoaderTasks([loader('failed', 'failed', 1)])).toBe(true);
    expect(hasFinishedLoaderTasks([loader('gone', 'successful', 30)])).toBe(true);
  });
});
