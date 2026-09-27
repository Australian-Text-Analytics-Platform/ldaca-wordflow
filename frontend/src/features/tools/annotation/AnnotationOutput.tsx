import { ReviewViewport } from './ReviewViewport';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import * as api from '@/features/project/api';
import { ProjectTable } from '@/features/project/data-view/components/ProjectTable';
import { objectDependencies } from '@/features/project/projectChanges';
import { decodeArrowData, isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { ColumnChoices, ReviewFilter, Score } from './AnnotationEditor';
import { AnnotationLabelCell } from './AnnotationLabelCell';
import { CorrectionDraft, type CorrectionEditor, type CorrectionSession } from './CorrectionDraft';
import { pageComparison } from './pageComparison';
export function AnnotationOutput({
  base,
  tab,
  setup,
  result,
  preview,
  outdated = false,
  page: previewPage = 1,
  size: previewSize = 10,
  onPage,
  onUseExamples,
  onEdit,
  editorSession,
  onEditorFinished,
  previewMode = false,
  pending,
  onCancelPreview,
  onRetryPreview,
}: {
  editorSession?: CorrectionSession | null;
  onEditorFinished: () => void;
  previewMode?: boolean;
  pending?: { error?: string; startedAt: number };
  onCancelPreview?: () => void;
  onRetryPreview?: () => void;
  base: string;
  tab: string;
  setup: api.AnnotationSetup;
  result?: api.AnnotationResult;
  preview?: api.AnnotationPreview;
  outdated?: boolean;
  page?: number;
  size?: number;
  onPage?: (page: number, size: number) => void;
  onUseExamples: () => void;
  onEdit: (session: api.CellEditSession, setup: api.AnnotationSetup) => void;
}) {
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const [compare, setCompare] = useState<string[]>([]),
    [metadata, setMetadata] = useState<string[]>([]),
    [revealed, setRevealed] = useState<string[]>([]);
  const [metric, setMetric] = useState<'kappa' | 'alpha' | 'agreement'>('kappa');
  const [diagnosticPage, setDiagnosticPage] = useState(1);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [filter, setFilter] = useState<api.AnnotationFilter | null>(null);
  const book = useQuery({
    queryKey: ['native', base, 'annotation-codebook', setup.codebook],
    queryFn: ({ signal }) => {
      if (!setup.codebook) throw new Error('Choose a Codebook');
      return api.annotationCodebook(base, setup.codebook, signal);
    },
    enabled: Boolean(setup.codebook),
    meta: setup.codebook ? objectDependencies(setup.codebook.source) : undefined,
  });
  const rows = useQuery({
    queryKey: [
      'native',
      base,
      'analyses',
      result?.id,
      'annotation-rows',
      page,
      size,
      compare,
      filter,
      setup.correction,
    ],
    queryFn: ({ signal }) =>
      api.annotationRows(
        base,
        result?.id ?? '',
        page,
        size,
        { compare, changes: [], filter },
        signal,
        setup.correction,
      ),
    enabled: Boolean(result) && !editorSession,
    staleTime: Infinity,
    placeholderData: (previous) => previous,
    meta: objectDependencies(setup.source, ...(setup.codebook ? [setup.codebook.source] : [])),
  });
  const context = useQuery({
    queryKey: ['native', base, 'analyses', result?.id, 'annotation-context'],
    queryFn: ({ signal }) => api.annotationContext(base, result?.id ?? '', signal),
    enabled: contextOpen && Boolean(result),
    staleTime: Infinity,
  });
  const diagnostics = useQuery({
    queryKey: ['native', base, 'analyses', result?.id, 'annotation-diagnostics', diagnosticPage],
    queryFn: ({ signal }) =>
      api.annotationDiagnostics(base, result?.id ?? '', diagnosticPage, signal),
    enabled: diagnosticsOpen && Boolean(result),
    staleTime: Infinity,
  });
  const edit = useMutation({
    mutationFn: () => {
      const stamp = preview?.mutation_stamp ?? rows.data?.live.mutation_stamp;
      if (!stamp) throw new Error('Refresh the displayed rows before editing corrections');
      return api.beginAnnotationEdit(base, tab, { mode: 'corrections', setup, expected: stamp });
    },
    onSuccess: (session) => {
      onEdit(session, structuredClone(setup));
    },
  });
  const editing = Boolean(editorSession);
  const content = (editor?: CorrectionEditor) => {
    const table = preview?.table ?? (previewMode ? undefined : rows.data?.table);
    const editingPage = !previewMode ? editor?.rows.data : undefined;
    const decoded = editingPage ?? (table ? decodeArrowData(table) : null);
    const roles = [
      setup.document,
      ...(setup.annotation ? [setup.annotation] : []),
      ...(setup.correction ? [setup.correction] : []),
    ];
    const visible = [...roles, ...compare, ...metadata].filter(
      (name, index, all) => decoded?.columns.includes(name) && all.indexOf(name) === index,
    );
    const editableCell = (index: number, column: string) => {
      if (!editor || column !== setup.correction) return undefined;
      if (!previewMode) return editor.cell(index, column);
      const ref = preview?.row_refs[index];
      if (ref === null || ref === undefined || !decoded) return undefined;
      const original = decoded.rows[index]?.[column];
      return editor.referencedCell(ref, column, typeof original === 'string' ? original : null);
    };
    const summary =
      preview && decoded
        ? {
            total_rows: decoded.rows.length,
            filtered_rows: decoded.rows.length,
            comparisons: [
              ...new Set([...(setup.correction ? [setup.correction] : []), ...compare]),
            ].map((column) =>
              pageComparison(
                column,
                preview.predictions,
                decoded.rows.map((row, index) =>
                  editableCell(index, column) ? editableCell(index, column)?.value : row[column],
                ),
                setup.codebook ? (book.data ?? []).map((code) => code.code) : null,
              ),
            ),
          }
        : (editingPage?.review ?? rows.data?.summary);
    return (
      <>
        <h2 className="font-semibold">
          {previewMode ? 'Preview' : result ? 'Results' : 'Corrections'}
        </h2>
        {preview ? (
          <p className="text-description text-label-secondary">
            Current document page · {preview.skipped} blank documents skipped ·{' '}
            {preview.excluded_examples} invalid examples excluded
          </p>
        ) : (
          result && (
            <p className="text-description text-label-secondary">
              Historical Run: {result.report.processed} processed · {result.report.preserved}{' '}
              preserved · {result.report.skipped} skipped · {result.report.failed} failed. The table
              below shows current source labels.
            </p>
          )
        )}
        {(outdated || rows.isError || rows.data?.live.outdated) && (
          <p role="status">
            Displayed data is outdated.{' '}
            {preview
              ? 'Click Preview or choose another page to calculate fresh predictions.'
              : 'Retry the live review.'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {decoded && (
            <ColumnChoices
              label="Compare To"
              columns={decoded.schema
                .filter(
                  (c) =>
                    isArrowStringField(c.field) &&
                    !roles.includes(c.name) &&
                    !metadata.includes(c.name),
                )
                .map((c) => c.name)}
              value={compare}
              onChange={(value) => {
                setCompare(value);
                setRevealed([]);
                setFilter(null);
                setPage(1);
                editor?.setPage(1);
              }}
            />
          )}
          <ColumnChoices
            label="Metadata"
            columns={(decoded?.columns ?? []).filter(
              (c) => !roles.includes(c) && !compare.includes(c),
            )}
            value={metadata}
            onChange={setMetadata}
          />
          <SearchableSelect
            ariaLabel="Comparison metric"
            value={metric}
            options={[
              { value: 'kappa', label: 'Cohen’s κ' },
              { value: 'alpha', label: 'Krippendorff’s α' },
              { value: 'agreement', label: 'Percent Agreement' },
            ]}
            onChange={(value) => {
              setMetric(value as typeof metric);
            }}
          />
          {!previewMode && (
            <ReviewFilter
              annotation={setup.annotation}
              compare={compare}
              filter={filter}
              onChange={(value) => {
                setFilter(value);
                setPage(1);
                editor?.setPage(1);
              }}
            />
          )}
          <Button
            variant="outline"
            disabled={
              editing ||
              !decoded ||
              !setup.correction ||
              outdated ||
              rows.isFetching ||
              edit.isPending ||
              Boolean(rows.data?.live.outdated)
            }
            onClick={() => {
              edit.mutate();
            }}
          >
            Edit corrections
          </Button>
          <Button variant="ghost" disabled={editing || !setup.correction} onClick={onUseExamples}>
            Use as Example
          </Button>
          {result && (
            <Button
              variant="ghost"
              onClick={() => {
                setContextOpen(!contextOpen);
              }}
            >
              Captured Codebook and examples
            </Button>
          )}
        </div>
        {result && result.report.failed > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              setDiagnosticsOpen(!diagnosticsOpen);
            }}
          >
            Failed-row diagnostics ({result.report.failed})
          </Button>
        )}
        {diagnosticsOpen && result && (
          <div className="max-h-64 overflow-auto">
            <p className="text-description text-label-secondary">
              Historical identifiers at Run time. These diagnostics never apply changes to the
              current table.
            </p>
            <ProjectTable
              data={diagnostics.data?.rows ?? []}
              columns={diagnostics.data?.columns ?? []}
              columnFields={Object.fromEntries(
                (diagnostics.data?.schema ?? []).map((c) => [c.name, c.field]),
              )}
              loading={diagnostics.isPending}
              pagination={{ page: diagnosticPage, page_size: 20 }}
              rowCount={result.report.failed}
              onPageChange={setDiagnosticPage}
            />
          </div>
        )}
        {contextOpen && (
          <section
            aria-label="Captured inference context"
            className="space-y-3 rounded border border-surface-border p-3"
          >
            {context.isPending ? (
              <p role="status">Loading captured context…</p>
            ) : context.isError ? (
              <p>
                Could not load captured context.{' '}
                <Button
                  variant="outline"
                  onClick={() => {
                    void context.refetch();
                  }}
                >
                  Retry
                </Button>
              </p>
            ) : (
              <>
                <h3 className="font-semibold">Codebook used for this Run</h3>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-body">
                    <thead className="sticky top-0 bg-surface">
                      <tr>
                        <th className="p-2 text-left">Code</th>
                        <th className="p-2 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.data.codes.map((item) => (
                        <tr key={item.code}>
                          <td className="p-2 align-top">{item.code}</td>
                          <td className="whitespace-pre-wrap break-words p-2">
                            {item.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="font-semibold">Examples ({context.data.examples.length})</h3>
                <div className="max-h-64 space-y-2 overflow-auto">
                  {context.data.examples.map((item, index) => (
                    <details key={index} className="rounded border border-surface-border p-2">
                      <summary className="cursor-pointer break-words">
                        {item.label} · {Array.from(item.text).slice(0, 160).join('')}
                        {Array.from(item.text).length > 160 ? '…' : ''}
                      </summary>
                      <p className="whitespace-pre-wrap break-words">{item.text}</p>
                    </details>
                  ))}
                </div>
                {Boolean(context.data.excluded_examples) && (
                  <p>
                    {context.data.excluded_examples} examples excluded because their labels were
                    outside the captured Codebook.
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer">Raw JSON</summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-description">
                    {JSON.stringify(context.data, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </section>
        )}
        {summary && (
          <p className="text-description text-label-secondary">
            {preview ? 'Current page' : 'Live source'}: {summary.total_rows} documents
            {!preview && ` · ${String(summary.filtered_rows)} shown by filters`}
          </p>
        )}
        {pending ? (
          <AnalysisProgress
            name="Annotation Preview"
            message={pending.error ?? 'Predicting this document page…'}
            error={Boolean(pending.error)}
            startedAt={pending.startedAt}
            onCancel={onCancelPreview}
            onRetry={pending.error ? onRetryPreview : undefined}
          />
        ) : !decoded && editor && previewMode ? (
          <p>
            Predictions cleared. Preview another page to continue reviewing; your correction draft
            is retained.
          </p>
        ) : !decoded ? (
          <AnalysisProgress
            name="Live review"
            message={
              rows.isError
                ? 'Could not load the current source. The saved report remains available.'
                : 'Loading results…'
            }
            error={rows.isError}
            onRetry={
              rows.isError
                ? () => {
                    void rows.refetch();
                  }
                : undefined
            }
          />
        ) : (
          <ReviewViewport>
            <ProjectTable
              base={base}
              data={editingPage ? (editor?.data ?? []) : decoded.rows}
              columns={visible}
              columnFields={Object.fromEntries(decoded.schema.map((c) => [c.name, c.field]))}
              fetching={editingPage ? editor?.rows.isFetching : rows.isFetching}
              documentColumn={setup.document}
              nodeLabel={setup.source.name}
              pagination={{
                page: previewMode ? previewPage : (editor?.page ?? page),
                page_size: previewMode ? previewSize : (editor?.pageSize ?? size),
              }}
              rowCount={preview ? undefined : summary?.filtered_rows}
              hasNext={preview?.has_next}
              onPageChange={(value) => {
                if (preview) onPage?.(value, previewSize);
                else if (editor) editor.setPage(value);
                else setPage(value);
              }}
              onPageSizeChange={(value) => {
                if (preview) onPage?.(1, value);
                else if (editor) editor.setPageSize(value);
                else {
                  setSize(value);
                  setPage(1);
                }
              }}
              renderCell={(index, column) => {
                const cell = editableCell(index, column);
                if (cell)
                  return (
                    <AnnotationLabelCell
                      cell={cell}
                      codes={book.data}
                      hasCodebook={Boolean(setup.codebook)}
                      loading={book.isFetching}
                    />
                  );
                if (compare.includes(column) && !revealed.includes(column))
                  return <span className="text-label-secondary">Hidden</span>;
                const value = decoded.rows[index]?.[column];
                if (
                  [setup.annotation, setup.correction].includes(column) &&
                  typeof value === 'string' &&
                  setup.codebook &&
                  book.data &&
                  !book.data.some((c) => c.code === value.trim())
                )
                  return (
                    <span>
                      {value}
                      <span className="block text-description text-label-secondary">
                        Not in current Codebook
                      </span>
                    </span>
                  );
                return undefined;
              }}
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
                          ? revealed.filter((c) => c !== column)
                          : [...revealed, column],
                      );
                    }}
                  />
                ) : null;
              }}
              rowActions={
                preview
                  ? {
                      header: 'Prediction',
                      render: (index) => {
                        const prediction = preview.predictions[index];
                        return prediction === null ? (
                          <span>Skipped</span>
                        ) : prediction?.status === 'failed' ? (
                          <span title={prediction.error.message}>Failed</span>
                        ) : (
                          <span>{prediction?.label ?? 'None'}</span>
                        );
                      },
                    }
                  : undefined
              }
            />
          </ReviewViewport>
        )}
      </>
    );
  };
  return (
    <section
      aria-label={previewMode ? 'Annotation Preview' : 'Annotation Results'}
      className="min-w-0 space-y-3 rounded-lg border border-surface-border p-3"
    >
      {editorSession ? (
        <CorrectionDraft
          base={base}
          value={editorSession}
          review={{ compare, filter }}
          onFinished={onEditorFinished}
          onUseExamples={onUseExamples}
        >
          {content}
        </CorrectionDraft>
      ) : (
        content()
      )}
    </section>
  );
}
