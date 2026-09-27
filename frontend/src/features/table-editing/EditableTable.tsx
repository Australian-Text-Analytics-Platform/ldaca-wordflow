import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProjectTable } from '@/features/project/data-view/components/ProjectTable';
import { cn } from '@/lib/utils';
import type { EditableCell, useTableEditing } from './useTableEditing';

function ScalarCell({ cell }: { cell: EditableCell }) {
  const choices = cell.column.data_type === 'BOOLEAN' ? ['true', 'false'] : cell.options;
  return (
    <div
      className={cn(
        'flex min-w-36 items-center gap-1',
        cell.changed && 'border-l-2 border-focus pl-1',
      )}
    >
      {choices ? (
        <select
          aria-label={`Edit ${cell.column.name}`}
          value={cell.value === null ? 'null' : `value:${cell.value}`}
          disabled={cell.disabled}
          className="h-8 min-w-0 flex-1 rounded border border-input-border bg-[var(--vscode-input-background)] px-2 text-[var(--vscode-input-foreground)]"
          onChange={(event) => {
            cell.onChange(event.target.value === 'null' ? null : event.target.value.slice(6));
          }}
        >
          <option value="null">NULL</option>
          {choices.map((value) => (
            <option key={value} value={`value:${value}`}>
              {value === '' ? '(empty string)' : value}
            </option>
          ))}
        </select>
      ) : (
        <>
          {cell.column.data_type === 'VARCHAR' ? (
            <Textarea
              aria-label={`Edit ${cell.column.name}`}
              value={cell.value ?? ''}
              placeholder={cell.value === null ? 'NULL' : undefined}
              rows={1}
              disabled={cell.disabled}
              spellCheck={false}
              className="min-h-8 min-w-0 flex-1 resize-y field-sizing-fixed"
              onChange={(event) => {
                cell.onChange(event.target.value);
              }}
            />
          ) : (
            <Input
              aria-label={`Edit ${cell.column.name}`}
              value={cell.value ?? ''}
              placeholder={cell.value === null ? 'NULL' : undefined}
              disabled={cell.disabled}
              spellCheck={false}
              className="h-8 min-w-0 flex-1"
              onChange={(event) => {
                cell.onChange(event.target.value);
              }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${cell.value === null ? 'Set value for' : 'Set NULL for'} ${cell.column.name}`}
            disabled={cell.disabled}
            onClick={() => {
              cell.onChange(cell.value === null ? '' : null);
            }}
          >
            {cell.value === null ? 'Value' : 'NULL'}
          </Button>
        </>
      )}
    </div>
  );
}

/** Presentation can be embedded in any panel. Callers can replace scalar controls (e.g. labels). */
export function EditableTable({
  editor,
  renderEditor,
  columns,
  columnHeaderExtra,
  renderValue,
}: {
  editor: ReturnType<typeof useTableEditing>;
  renderEditor?: (cell: EditableCell) => ReactNode;
  columns?: string[];
  columnHeaderExtra?: (column: string) => ReactNode;
  renderValue?: (row: number, column: string) => ReactNode;
}) {
  const page = editor.rows.data;
  return (
    <ProjectTable
      data={editor.data}
      rowIds={editor.rowIds}
      rowActions={
        editor.addRowAbove && editor.deleteRow
          ? {
              header:
                editor.data.length === 0 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Add row"
                    title="Add row"
                    disabled={editor.busy || editor.rows.isPending}
                    onClick={() => {
                      editor.addRowAbove?.();
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                ) : undefined,
              render: (row) => (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Delete row"
                    title="Delete row"
                    disabled={editor.busy}
                    onClick={() => {
                      editor.deleteRow?.(row);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Add row above"
                    title="Add row above"
                    disabled={editor.busy}
                    onClick={() => {
                      editor.addRowAbove?.(row);
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              ),
            }
          : undefined
      }
      columns={columns ?? page?.columns ?? []}
      columnHeaderExtra={columnHeaderExtra}
      columnFields={Object.fromEntries(
        (page?.schema ?? []).map((column) => [column.name, column.field]),
      )}
      loading={editor.rows.isPending}
      fetching={editor.rows.isFetching}
      pageError={editor.rows.error}
      pagination={{ page: editor.page, page_size: editor.pageSize }}
      rowCount={editor.rowCount}
      hasNext={page?.hasNext ?? false}
      sorting={editor.sorting}
      onSortingChange={editor.setSorting}
      onPageChange={editor.setPage}
      onPageSizeChange={editor.setPageSize}
      renderCell={(row, name) => {
        const cell = editor.cell(row, name);
        return cell ? (
          renderEditor ? (
            renderEditor(cell)
          ) : (
            <ScalarCell cell={cell} />
          )
        ) : (
          renderValue?.(row, name)
        );
      }}
    />
  );
}
