import { describe, expect, it } from 'vitest';
import { buildTaskRows } from '../taskRows';

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
