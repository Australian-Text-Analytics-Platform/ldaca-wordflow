import * as api from '@/features/project/api';

type SqlCellMode = 'default' | 'live';
export interface SqlCellSource {
  sql: string;
  mode: SqlCellMode;
}
export interface SqlCellRecord extends SqlCellSource {
  id: string;
  position: number;
}
export const sqlCellsKey = (base: string) => ['native', base, 'sql-cells'] as const;

export async function loadSqlCells(base: string, signal?: AbortSignal): Promise<SqlCellRecord[]> {
  const table = await api.querySql(
    base,
    [
      {
        sql: 'SELECT id::VARCHAR AS id, position, sql, mode FROM wordflow.sql_cells ORDER BY position, id',
      },
    ],
    signal,
  );
  return Array.from(table.toArray() as Record<string, unknown>[], (row) => ({
    id: String(row.id),
    position: Number(row.position),
    sql: String(row.sql),
    mode: row.mode as SqlCellMode,
  }));
}
export function saveCellStatement(id: string, source: SqlCellSource): api.Statement {
  return {
    sql: 'UPDATE wordflow.sql_cells SET sql=?, mode=? WHERE id=?',
    parameters: [source.sql, source.mode, id],
  };
}
export function reorderCellStatements(ids: string[]): api.Statement[] {
  return ids.map((id, position) => ({
    sql: 'UPDATE wordflow.sql_cells SET position=? WHERE id=?',
    parameters: [position, id],
  }));
}

interface Execution {
  id: string;
  live: boolean;
  valid: () => boolean;
  run: () => Promise<void>;
}
/** Explicit runs are independent; automatic previews coalesce per cell. */
export class ConsoleRunner {
  private running = new Set<string>();
  private pending = new Map<string, Execution>();
  enqueue(job: Execution) {
    if (!job.live) {
      if (job.valid()) void job.run();
      return;
    }
    this.pending.set(job.id, job);
    void this.drain(job.id);
  }
  clearPending() {
    this.pending.clear();
  }
  private async drain(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      while (this.pending.has(id)) {
        const job = this.pending.get(id);
        this.pending.delete(id);
        if (job?.valid()) await job.run();
      }
    } finally {
      this.running.delete(id);
    }
  }
}
