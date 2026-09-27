import { ReviewViewport } from './ReviewViewport';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import * as api from '@/features/project/api';
import { objectDependencies } from '@/features/project/projectChanges';
import { EditableTable } from '@/features/table-editing/EditableTable';
import { EditingLeaveDialog } from '@/features/table-editing/EditingLeaveDialog';
import { AnnotationLabelCell } from './AnnotationLabelCell';
import { useTableEditing } from '@/features/table-editing/useTableEditing';

export function ColumnChoices({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: string[];
  value: string[];
  onChange: (columns: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          {label} ({value.length}) <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        className="flex max-h-80 flex-col gap-2 overflow-y-auto"
      >
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onChange(columns);
            }}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onChange([]);
            }}
          >
            Select none
          </Button>
        </div>
        {columns.map((column) => (
          <label key={column} className="flex items-center gap-2 break-all">
            <Checkbox
              checked={value.includes(column)}
              onCheckedChange={(checked) => {
                onChange(checked === true ? [...value, column] : value.filter((v) => v !== column));
              }}
            />
            {column}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
export function Score({
  value,
  metric,
  revealed,
  onReveal,
}: {
  value: api.AnnotationComparison;
  metric: 'kappa' | 'alpha' | 'agreement';
  revealed: boolean;
  onReveal: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            onMouseEnter={() => {
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
            }}
          >
            {metric === 'kappa' ? 'κ' : metric === 'alpha' ? 'α' : 'Agreement'}{' '}
            {value[metric] === null
              ? '—'
              : metric === 'agreement'
                ? `${(value[metric] * 100).toFixed(1)}%`
                : value[metric].toFixed(3)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          onMouseLeave={() => {
            setOpen(false);
          }}
          className="max-h-80 w-96 max-w-[calc(100vw-2rem)] overflow-auto"
        >
          <p>
            {value.included} included · {value.excluded} excluded
          </p>
          <table className="w-full">
            <caption>Confusion matrix: {value.column}</caption>
            <thead>
              <tr>
                <th>Annotation</th>
                <th>Compare To</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {value.matrix.map((row) => (
                <tr key={JSON.stringify([row.annotation, row.comparison])}>
                  <td>{row.annotation}</td>
                  <td>{row.comparison}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PopoverContent>
      </Popover>
      <Button size="sm" variant="ghost" onClick={onReveal}>
        {revealed ? 'Mask' : 'Reveal'}
      </Button>
    </div>
  );
}
export function ReviewFilter({
  annotation,
  compare,
  filter,
  onChange,
}: {
  annotation: string;
  compare: string[];
  filter: api.AnnotationFilter | null;
  onChange: (value: api.AnnotationFilter | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          Row filter <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-3">
        <SearchableSelect
          ariaLabel="Filter column"
          options={[annotation, ...compare].map((value) => ({ value }))}
          value={filter?.column ?? annotation}
          onChange={(column) => {
            onChange({ ...(filter ?? { differs: false, existence: 'off' }), column });
          }}
        />
        <label className="flex items-center gap-2">
          <Checkbox
            disabled={filter?.existence === 'empty'}
            checked={filter?.differs ?? false}
            onCheckedChange={(checked) => {
              onChange({
                ...(filter ?? { column: annotation, existence: 'off' }),
                differs: checked === true,
              });
            }}
          />
          Different valid labels
        </label>
        <SearchableSelect
          ariaLabel="Label existence"
          value={filter?.existence ?? 'off'}
          options={[
            { value: 'off', label: 'Any' },
            { value: 'present', label: 'Valid label present' },
            { value: 'empty', label: 'Blank or invalid label' },
          ]}
          onChange={(existence) => {
            if (existence === 'off' || existence === 'present' || existence === 'empty') {
              onChange({
                ...(filter ?? { column: annotation, differs: false }),
                existence,
                differs: existence === 'empty' ? false : (filter?.differs ?? false),
              });
            }
          }}
        />
        <Button
          variant="ghost"
          onClick={() => {
            onChange(null);
          }}
        >
          Clear filter
        </Button>
      </PopoverContent>
    </Popover>
  );
}
export function AnnotationEditor({
  base,
  session,
  setup,
  onFinished,
  title = 'Manual Annotation',
  onUseExamples,
}: {
  base: string;
  session: api.CellEditSession;
  setup?: api.AnnotationSetup;
  onFinished: () => void;
  title?: string;
  onUseExamples?: () => void;
}) {
  const [compare, setCompare] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [filter, setFilter] = useState<api.AnnotationFilter | null>(null);
  const [metric, setMetric] = useState<'kappa' | 'alpha' | 'agreement'>('kappa');
  const roles = setup
    ? [setup.document, setup.annotation, ...(setup.correction ? [setup.correction] : [])]
    : [];
  const available = session.columns.filter((c) => !roles.includes(c.name)).map((c) => c.name);
  const comparable = session.columns
    .filter(
      (c) => c.data_type === 'VARCHAR' && !roles.includes(c.name) && !metadata.includes(c.name),
    )
    .map((c) => c.name);
  const editor = useTableEditing({
    base,
    session,
    onFinished,
    allowRowChanges: !setup,
    initialPageSize: 10,
    liveDependencies: setup?.codebook ? [api.objectRef(setup.codebook.source)] : undefined,
    review: setup ? { compare, filter } : undefined,
  });
  const book = useQuery({
    queryKey: ['native', base, 'annotation-codebook', setup?.codebook],
    queryFn: ({ signal }) => {
      if (!setup?.codebook) throw new Error('Choose a Codebook');
      return api.annotationCodebook(base, setup.codebook, signal);
    },
    enabled: Boolean(setup?.codebook),
    meta: setup?.codebook ? objectDependencies(setup.codebook.source) : undefined,
  });
  const visible = setup
    ? [...roles, ...compare, ...metadata.filter((c) => !compare.includes(c))]
    : session.columns.map((c) => c.name);
  const summary = editor.rows.data?.review;
  return (
    <section
      aria-label={setup ? title : 'Codebook editor'}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-lg border border-surface-border p-3"
    >
      {setup && (
        <>
          <h2 className="font-semibold">{title}</h2>
          {onUseExamples && (
            <Button
              variant="outline"
              disabled={editor.saving}
              onClick={() => {
                void editor
                  .saveAsync()
                  .then(onUseExamples)
                  .catch(() => {
                    /* Shared mutation observer reports failure; keep the draft. */
                  });
              }}
            >
              Save and use as examples
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <ColumnChoices
              label="Compare To"
              columns={comparable}
              value={compare}
              onChange={(next) => {
                setCompare(next);
                setFilter(null);
                setRevealed([]);
                editor.setPage(1);
              }}
            />
            <ColumnChoices
              label="Metadata"
              columns={available.filter((c) => !compare.includes(c))}
              value={metadata}
              onChange={setMetadata}
            />
            <SearchableSelect
              ariaLabel="Agreement measure"
              options={[
                { value: 'kappa', label: 'Cohen’s κ' },
                { value: 'alpha', label: 'Krippendorff’s α' },
                { value: 'agreement', label: 'Percent Agreement' },
              ]}
              value={metric}
              onChange={(value) => {
                if (value === 'kappa' || value === 'alpha' || value === 'agreement')
                  setMetric(value);
              }}
            />
            <ReviewFilter
              annotation={setup.annotation}
              compare={compare}
              filter={filter}
              onChange={(next) => {
                setFilter(next);
                editor.setPage(1);
              }}
            />
          </div>
          <p role="status" className="text-description text-label-secondary">
            {summary
              ? `${String(summary.filtered_rows)} of ${String(summary.total_rows)} documents`
              : 'Loading documents…'}
            {editor.modified ? ' · Includes unsaved changes' : ''}
            {editor.rows.isFetching ? ' · Updating…' : ''}
          </p>
        </>
      )}
      <ReviewViewport>
        <EditableTable
          editor={editor}
          columns={visible}
          columnHeaderExtra={(column) => {
            const value = summary?.comparisons.find((c) => c.column === column);
            return value ? (
              <Score
                value={value}
                metric={metric}
                revealed={revealed.includes(column)}
                onReveal={() => {
                  setRevealed(
                    revealed.includes(column)
                      ? revealed.filter((v) => v !== column)
                      : [...revealed, column],
                  );
                }}
              />
            ) : undefined;
          }}
          renderValue={(_, column) =>
            compare.includes(column) && !revealed.includes(column) ? (
              <span aria-label="Masked comparison">•••</span>
            ) : undefined
          }
          renderEditor={
            setup
              ? (cell) => {
                  return (
                    <AnnotationLabelCell
                      cell={cell}
                      codes={book.data}
                      hasCodebook={Boolean(setup.codebook)}
                      loading={book.isFetching}
                    />
                  );
                }
              : undefined
          }
        />
      </ReviewViewport>
      {editor.rows.isError && (
        <Button
          variant="outline"
          onClick={() => {
            void editor.rows.refetch();
          }}
        >
          Retry loading page
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-description text-label-secondary">
          {editor.changedCells} changed cells
          {editor.addedRows ? ` · ${String(editor.addedRows)} added rows` : ''}
          {editor.deletedRows ? ` · ${String(editor.deletedRows)} deleted rows` : ''}
        </span>
        <Button variant="outline" disabled={editor.busy} onClick={editor.cancel}>
          Cancel
        </Button>
        <Button disabled={editor.busy || editor.rows.isPending} onClick={editor.save}>
          {editor.saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <EditingLeaveDialog id={session.session_id} editor={editor} />
    </section>
  );
}
