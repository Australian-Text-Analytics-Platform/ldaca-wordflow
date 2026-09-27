import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Code2, GripVertical, MoreHorizontal, Play, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import HelpIcon from '@/components/help/HelpIcon';
import * as api from '@/features/project/api';
import { reportProjectError } from '@/features/project/projectErrors';
import { decodeArrowData } from '@/lib/arrow/decodeArrowTable';
import { SqlEditor } from './SqlEditor';
import { PreviewTable } from '../components/PreviewTable';
import {
  ConsoleRunner,
  loadSqlCells,
  reorderCellStatements,
  saveCellStatement,
  sqlCellsKey,
  type SqlCellRecord,
  type SqlCellSource,
} from './sqlCells';

export function SqlSubTab({
  base,
  active,
  editing,
}: {
  base: string;
  active: boolean;
  editing: boolean;
}) {
  const client = useQueryClient();
  const queryKey = sqlCellsKey(base);
  const cells = useQuery({
    queryKey,
    queryFn: ({ signal }) => loadSqlCells(base, signal),
    enabled: active,
  });
  const [runner] = useState(() => new ConsoleRunner());
  // Only membership/order and seeds for local drafts live here. Saved source belongs to Query.
  const [localCells, setLocalCells] = useState<SqlCellRecord[] | null>(null);
  const ordered = useRef<SqlCellRecord[] | null>(null);
  function publish(next: SqlCellRecord[]) {
    ordered.current = next;
    setLocalCells(next);
  }
  useEffect(() => {
    if (!cells.data || ordered.current !== null) return;
    const initial = cells.data.length
      ? cells.data
      : [{ id: crypto.randomUUID(), position: 0, sql: '', mode: 'default' as const }];
    ordered.current = initial;
    setLocalCells(initial);
  }, [cells.data]);
  type CellChange = { kind: 'source'; id: string; source: SqlCellSource } | { kind: 'structure' };
  const { mutateAsync: persistCells } = useMutation({
    scope: { id: `${base}:sql-cells` },
    meta: { reportError: false },
    mutationFn: async (change: CellChange) => {
      const saved = client.getQueryData<SqlCellRecord[]>(queryKey) ?? [];
      const ids = (ordered.current ?? []).map((cell) => cell.id);
      if (change.kind === 'source') {
        const position = ids.indexOf(change.id);
        if (position < 0) return false;
        const previous = saved.find((cell) => cell.id === change.id);
        if (previous?.sql === change.source.sql && previous.mode === change.source.mode)
          return true;
        await api.executeSql(
          base,
          previous
            ? [saveCellStatement(change.id, change.source)]
            : [
                {
                  sql: 'INSERT INTO wordflow.sql_cells (id,position,sql,mode) VALUES (?, ?, ?, ?)',
                  parameters: [change.id, position, change.source.sql, change.source.mode],
                },
                ...reorderCellStatements(ids).filter((_, index) =>
                  saved.some((cell) => cell.id === ids[index] && cell.position !== index),
                ),
              ],
          { resources: ['sql_cells'] },
        );
        client.setQueryData<SqlCellRecord[]>(queryKey, (current = []) => {
          const next = current
            .filter((cell) => cell.id !== change.id)
            .map((cell) => ({
              ...cell,
              position: previous ? cell.position : ids.indexOf(cell.id),
            }));
          next.push({ id: change.id, position, ...change.source });
          return next.sort((a, b) => a.position - b.position);
        });
      } else {
        const retained = saved.filter((cell) => ids.includes(cell.id));
        const statements = [
          ...saved
            .filter((cell) => !ids.includes(cell.id))
            .map((cell) => ({
              sql: 'DELETE FROM wordflow.sql_cells WHERE id=?',
              parameters: [cell.id],
            })),
          ...reorderCellStatements(ids).filter((_, index) =>
            retained.some((cell) => cell.id === ids[index] && cell.position !== index),
          ),
        ];
        if (statements.length) await api.executeSql(base, statements, { resources: ['sql_cells'] });
        client.setQueryData<SqlCellRecord[]>(
          queryKey,
          retained
            .map((cell) => ({ ...cell, position: ids.indexOf(cell.id) }))
            .sort((a, b) => a.position - b.position),
        );
      }
      return true;
    },
  });
  const { mutate: changeStructure, isPending: changingStructure } = useMutation({
    meta: { reportError: false },
    mutationFn: async (next: SqlCellRecord[]) => {
      const previous = ordered.current;
      ordered.current = next;
      try {
        await persistCells({ kind: 'structure' });
        publish(next);
      } catch (error) {
        ordered.current = previous;
        reportProjectError(error, 'Could not save SQL cells');
      }
    },
  });
  useEffect(() => {
    if (!active) runner.clearPending();
    return () => {
      runner.clearPending();
    };
  }, [active, runner]);
  function insert(index: number, source: SqlCellSource = { sql: '', mode: 'default' }) {
    const next = [...(ordered.current ?? [])];
    next.splice(index, 0, { ...source, id: crypto.randomUUID(), position: index });
    changeStructure(next);
  }
  function move(id: string, index: number) {
    const next = [...(ordered.current ?? [])];
    const from = next.findIndex((cell) => cell.id === id);
    if (from < 0 || index < 0 || index >= next.length || from === index) return;
    const [cell] = next.splice(from, 1);
    if (cell) next.splice(index, 0, cell);
    changeStructure(next);
  }
  const structuralBlocked = changingStructure || editing;
  const visible = localCells ?? [];
  return (
    <div className="min-w-0 space-y-3" data-testid="sql-console">
      <div className="flex items-center gap-2 font-semibold">
        <Code2 className="size-5" />
        SQL console
        <HelpIcon targetKey="preprocessing.sql.tab" label="SQL help" />
      </div>
      <p className="text-body-secondary text-description">
        Run DuckDB SQL against this project. Use actual table names. New cells stay local until
        their first run. Previously run cells save on blur and before execution.
      </p>
      {editing && (
        <p className="text-body-secondary text-description">
          Finish table editing before running or saving SQL cells.
        </p>
      )}
      {cells.isPending && <p role="status">Loading SQL cells…</p>}
      {cells.isError && (
        <Button variant="outline" onClick={() => void cells.refetch()}>
          Retry loading cells
        </Button>
      )}
      {visible.map((seed, index) => (
        <div
          key={seed.id}
          className="min-w-0 space-y-2"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            const id = event.dataTransfer.getData('application/wordflow-sql-cell');
            if (id && !structuralBlocked) {
              event.preventDefault();
              move(id, index);
            }
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            aria-label={`Insert cell before ${String(index + 1)}`}
            disabled={structuralBlocked}
            onClick={() => {
              insert(index);
            }}
          >
            <Plus className="size-4" />
          </Button>
          <SqlCell
            cell={cells.data?.find((cell) => cell.id === seed.id) ?? seed}
            persisted={cells.data?.some((cell) => cell.id === seed.id) ?? false}
            index={index}
            total={visible.length}
            active={active}
            structuralBlocked={structuralBlocked}
            editing={editing}
            runner={runner}
            save={(source) => persistCells({ kind: 'source', id: seed.id, source })}
            execute={(source) =>
              api.runSqlScript(
                base,
                source.sql,
                source.mode === 'live' ? 'preview' : 'execute',
                source.mode === 'default' ? `SQL cell ${String(index + 1)}` : undefined,
              )
            }
            onMove={(target) => {
              move(seed.id, target);
            }}
            onDuplicate={(source) => {
              insert(index + 1, source);
            }}
            onDelete={() => {
              changeStructure(visible.filter((cell) => cell.id !== seed.id));
            }}
          />
        </div>
      ))}
      <Button
        variant="outline"
        className="w-full"
        disabled={structuralBlocked || cells.isPending}
        onClick={() => {
          insert(visible.length);
        }}
      >
        <Plus className="size-4" />
        Add Cell
      </Button>
    </div>
  );
}

interface SqlCellProps {
  cell: SqlCellRecord;
  index: number;
  total: number;
  active: boolean;
  structuralBlocked: boolean;
  persisted: boolean;
  editing: boolean;
  runner: ConsoleRunner;
  save: (source: SqlCellSource) => Promise<boolean>;
  execute: (source: SqlCellSource) => Promise<api.SqlExecutionResult>;
  onMove: (index: number) => void;
  onDuplicate: (source: SqlCellSource) => void;
  onDelete: () => void;
}
function SqlCell({
  cell,
  index,
  total,
  active,
  structuralBlocked,
  persisted,
  editing,
  runner,
  save,
  execute,
  onMove,
  onDuplicate,
  onDelete,
}: SqlCellProps) {
  const [draft, setDraft] = useState<SqlCellSource | null>(null);
  const source = draft ?? cell;
  const [saving, setSaving] = useState(0);
  const [executing, setExecuting] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<(api.SqlExecutionResult & { sql: string }) | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [liveRevision, setLiveRevision] = useState(0);
  const revision = useRef(0);
  const previewedRevision = useRef(0);
  const editor = useRef<EditorView | null>(null);
  const alive = useRef(true);
  const unsaved = !persisted || source.sql !== cell.sql || source.mode !== cell.mode;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function edit(next: SqlCellSource) {
    revision.current += 1;
    setDraft(next);
    setLiveRevision(revision.current);
  }
  async function persist(snapshot: SqlCellSource) {
    setSaving((count) => count + 1);
    try {
      return await save(snapshot);
    } finally {
      setSaving((count) => count - 1);
    }
  }
  function run(automatic = false) {
    if (editing || !source.sql.trim()) return;
    const version = revision.current;
    const snapshot = { sql: source.sql, mode: source.mode };
    const valid = () => alive.current && revision.current === version;
    runner.enqueue({
      id: cell.id,
      live: automatic,
      valid: automatic ? valid : () => alive.current,
      run: async () => {
        setExecuting((count) => count + 1);
        setStatus('Saving…');
        let saved = false;
        try {
          if (!(await persist(snapshot))) return;
          saved = true;
          if (automatic && !valid()) return;
          setStatus('Running…');
          const output = await execute(snapshot);
          if (alive.current) {
            setResult({ ...output, sql: snapshot.sql });
            setPage(1);
            setStatus('Completed');
          }
        } catch (error) {
          if (
            automatic &&
            saved &&
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'not_previewable'
          ) {
            if (valid()) setStatus('Waiting for one complete query');
          } else {
            if (alive.current)
              setStatus(
                error &&
                  typeof error === 'object' &&
                  'code' in error &&
                  error.code === 'interrupted'
                  ? 'Cancelled'
                  : 'Failed — edit and run again',
              );
            const statement =
              error && typeof error === 'object' && 'statementIndex' in error
                ? error.statementIndex
                : null;
            reportProjectError(
              error,
              typeof statement === 'number'
                ? `SQL failed at statement ${String(statement + 1)}`
                : 'SQL failed',
            );
          }
        } finally {
          if (alive.current) setExecuting((count) => count - 1);
        }
      },
    });
  }
  const runLive = useEffectEvent(() => {
    run(true);
  });
  // A persisted Live cell is inert until this mount receives an edit or mode choice.
  useEffect(() => {
    if (
      !active ||
      source.mode !== 'live' ||
      !liveRevision ||
      editing ||
      previewedRevision.current === liveRevision
    )
      return;
    const timer = setTimeout(() => {
      previewedRevision.current = liveRevision;
      runLive();
    }, 600);
    return () => {
      clearTimeout(timer);
    };
  }, [active, source.sql, source.mode, liveRevision, editing]);
  async function format() {
    const view = editor.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const start = from === to ? 0 : from;
    const end = from === to ? view.state.doc.length : to;
    const text = view.state.doc.sliceString(start, end);
    const version = revision.current;
    try {
      const { format: formatSql } = await import('sql-formatter');
      const formatted = formatSql(text, { language: 'duckdb' });
      if (alive.current && revision.current === version)
        view.dispatch({ changes: { from: start, to: end, insert: formatted } });
    } catch (error) {
      reportProjectError(error, 'Could not format SQL');
    }
  }
  const pageData = result
    ? decodeArrowData(result.table.slice((page - 1) * pageSize, page * pageSize))
    : null;
  return (
    <Card className="min-w-0" aria-label={`SQL cell ${String(index + 1)}`}>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 p-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move cell ${String(index + 1)}`}
          draggable={!structuralBlocked}
          disabled={structuralBlocked}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/wordflow-sql-cell', cell.id);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
              event.preventDefault();
              onMove(index + (event.key === 'ArrowUp' ? -1 : 1));
            }
          }}
        >
          <GripVertical className="size-4" />
        </Button>
        <div className="flex">
          <Button
            variant="outline"
            className="rounded-r-none"
            aria-label={`Run cell ${String(index + 1)}`}
            title="Run cell (⌘/Ctrl+Enter)"
            disabled={editing || !source.sql.trim()}
            onClick={() => {
              run();
            }}
          >
            <Play className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="rounded-l-none border-l-0"
                aria-label={`Execution mode for cell ${String(index + 1)}`}
                disabled={editing}
              >
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={source.mode}
                onValueChange={(mode) => {
                  const next = {
                    sql: source.sql,
                    mode: mode === 'live' ? ('live' as const) : ('default' as const),
                  };
                  edit(next);
                  if (persisted)
                    void persist(next).catch((error: unknown) => {
                      reportProjectError(error, 'Could not save SQL cell');
                    });
                }}
              >
                <DropdownMenuRadioItem value="default">
                  Default — run explicitly
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="live">
                  Live preview — one read-only query
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="text-body-secondary text-description">
          {source.mode === 'live' ? 'Live preview' : 'Default'}
        </span>
        <span className="ml-auto text-body-secondary text-description" aria-live="polite">
          {saving ? 'Saving…' : unsaved ? 'Unsaved' : 'Saved'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Cell ${String(index + 1)} options`}
              disabled={structuralBlocked}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={index === 0}
              onClick={() => {
                onMove(index - 1);
              }}
            >
              Move cell up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === total - 1}
              onClick={() => {
                onMove(index + 1);
              }}
            >
              Move cell down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onDuplicate(source);
              }}
            >
              Duplicate cell
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void format()}>Format selection/cell</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}>Delete cell</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 p-3 pt-0">
        <SqlEditor
          value={source.sql}
          onChange={(sql) => {
            edit({ ...source, sql });
          }}
          minHeight="8rem"
          placeholder="SELECT * FROM your_table;"
          onCreateEditor={(view) => {
            editor.current = view;
          }}
          onRun={() => {
            run();
          }}
          onFormat={() => void format()}
          onBlur={() => {
            if (persisted && unsaved && !editing)
              void persist(source).catch((error: unknown) => {
                reportProjectError(error, 'Could not save SQL cell');
              });
          }}
        />
        {(status || executing > 0) && (
          <p role="status" className="text-body-secondary text-description">
            {executing > 0
              ? `${String(executing)} execution${executing === 1 ? '' : 's'} pending · `
              : ''}
            {status}
          </p>
        )}
        {result && pageData && (
          <>
            {result.sql !== source.sql && (
              <p className="text-body-secondary text-description">
                Outdated result — SQL has changed.
              </p>
            )}
            {result.truncated && (
              <p className="text-body-secondary text-description">
                Showing the first 50,000 rows. All statements completed; use SQL COPY to export the
                full result.
              </p>
            )}
            <PreviewTable
              title="Result"
              description={`${String(result.statementsCompleted)} statement${result.statementsCompleted === 1 ? '' : 's'} completed · ${result.table.numRows.toLocaleString()} displayed rows`}
              columns={pageData.columns}
              schema={pageData.schema}
              data={pageData.rows}
              pagination={null}
              loading={false}
              error={null}
              ready
              page={page}
              pageSize={pageSize}
              rowCount={result.table.numRows}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
