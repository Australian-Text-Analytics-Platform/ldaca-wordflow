import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cachedDataBlockNames, suggestDataBlockName } from '@/features/project/automaticNames';
import { objectDependencies } from '@/features/project/projectChanges';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as quotationApi from '@/features/tools/quotation/api';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { showValue } from '../common/analysisValue';
import { AnalysisNumberInput } from '../common/components/AnalysisNumberInput';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisPublishMenu } from '../common/components/AnalysisPublishMenu';
import { inspectAnalysisRow } from '../common/components/inspectAnalysisRow';
import { RowDetailPanel } from '../common/components/RowDetailPanel';
import { TablePaginationFooter } from '../common/components/TablePaginationFooter';
import { useRowDetailDialog } from '../common/components/useRowDetailDialog';
import { useRetainedPages } from '../common/useRetainedPages';
import {
  quotationCell,
  quotationFields,
  quotationRows,
  quoteColors,
  type QuotationRow,
} from './quotationRows';
import { QuotationText } from './QuotationText';
type Page = Awaited<ReturnType<typeof quotationApi.previewQuotation>> & {
  input: quotationApi.QuotationRequest['input'];
};
interface Props {
  onCancelPreview?: () => void;
  base: string;
  tab: analysesApi.Tab;
  active: boolean;
  submitted?: { request: quotationApi.QuotationRequest; generation: number };
  draft: quotationApi.QuotationRequest;
  result?: quotationApi.QuotationAnalysisResult;
  view: 'preview' | 'saved';
  stopped: boolean;
  settings: Record<string, unknown>;
  onSettings: (patch: Record<string, unknown>) => void;
  color: string;
  editing: boolean;
}
export function QuotationResults({
  base,
  tab,
  active,
  submitted,
  draft,
  result,
  view,
  stopped,
  settings,
  onSettings,
  color,
  editing,
  onCancelPreview,
}: Props) {
  const saved = view === 'saved';
  const request =
    saved && result
      ? decodeAnalysisRequest('quotation', result.request_status).request
      : submitted?.request;
  const [page, setPage] = useState(1);
  const [pageSizes, setPageSizes] = useState({ preview: 50, saved: 20 });
  const pageSize = pageSizes[view];
  const [unit, setUnit] = useState<'documents' | 'matches'>('documents');
  const [sort, setSort] = useState<quotationApi.QuotationQuery['sort']>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [publish, setPublish] = useState<'documents' | 'matches' | null>(null);
  const context = typeof settings.context === 'number' ? settings.context : 5;
  const metadata = Array.isArray(settings.metadata) ? (settings.metadata as string[]) : [];
  const generated = Array.isArray(settings.fields) ? (settings.fields as string[]) : [];
  const identity = JSON.stringify([view, saved ? result?.id : submitted?.generation]);
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  if (identity !== previousIdentity) {
    setPreviousIdentity(identity);
    setPage(1);
    setSort(null);
    setDetail(null);
  }
  const input = request?.input ?? draft.input;
  const query: quotationApi.QuotationQuery = { projection: unit, page, page_size: pageSize, sort };
  const preview: quotationApi.QuotationPreviewRequest = {
    input,
    page,
    page_size: pageSize,
    sort: sort?.metadata ? { column: sort.field, descending: sort.descending } : null,
  };
  const data = useQuery({
    queryKey: saved
      ? ['native', base, 'analyses', result?.id, 'quotation', query, input]
      : ['native', base, 'analysis-preview', tab.id, submitted?.generation, preview],
    queryFn: async ({ signal }): Promise<Page> => ({
      ...(await (saved
        ? quotationApi.queryQuotation(base, result?.id ?? '', query, signal)
        : quotationApi.previewQuotation(base, tab.id, preview, signal))),
      input,
    }),
    enabled: active && Boolean(request) && (saved || !stopped),
    meta: saved ? undefined : objectDependencies(input.source),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  const retained = useRetainedPages(
    [JSON.stringify([view, saved ? result?.id : null, input.source])],
    [data],
  );
  const [displayed] = retained.pages;
  const displayInput = displayed?.input ?? input;
  const documentRows = displayed ? quotationRows(displayed.table) : [];
  const rows =
    !saved && unit === 'matches'
      ? documentRows.flatMap((row) => row.quotes.map((quote) => ({ ...row, quotes: [quote] })))
      : documentRows;
  const fields = rows[0]
    ? Object.keys(rows[0].source)
    : (result?.result.payload.columns.map(([name]) => name) ?? []);
  const selected = metadata.filter((name) => fields.includes(name));
  const stale = retained.stale[0] || (!saved && stopped);
  const setSorting = (field: string, isMetadata: boolean) => {
    setSort({
      field,
      metadata: isMetadata,
      descending: sort?.field === field && sort.metadata === isMetadata ? !sort.descending : false,
    });
    setPage(1);
  };
  if (!request) return null;
  if (!displayed)
    return (
      <AnalysisProgress
        name={tab.name}
        message={
          data.isError
            ? 'Could not load output.'
            : saved
              ? 'Loading results…'
              : 'Calculating Preview…'
        }
        error={data.isError}
        onRetry={
          data.isError
            ? () => {
                void data.refetch();
              }
            : undefined
        }
        onCancel={!saved ? onCancelPreview : undefined}
      />
    );
  return (
    <Tabs
      role="region"
      aria-label="Quotation results"
      value={unit}
      onValueChange={(value) => {
        setUnit(value as typeof unit);
        if (saved) {
          setSort(null);
          setPage(1);
        }
      }}
      className="gap-3 rounded-lg border border-surface-border p-3"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        {saved ? 'Results' : 'Preview'}{' '}
        <HelpIcon targetKey="analysis.quotation.results" label="Quotation results help" />
      </h2>
      <TabsList aria-label="Quotation presentation">
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="matches">Quotations</TabsTrigger>
      </TabsList>
      <TabsContent value={unit} className="min-w-0 flex flex-col gap-3">
        <>
          {JSON.stringify(draft) !== JSON.stringify(request) && (
            <p role="status" className="text-description">
              Results use previously submitted settings.
            </p>
          )}
          {stale && (
            <p role="status">
              {data.isError
                ? 'Outdated results: refresh failed.'
                : stopped && !saved
                  ? 'Preview stopped; previous page retained.'
                  : 'Updating results… Previous page shown.'}
            </p>
          )}
          {data.isError && (
            <div role="alert">
              Could not load results.{' '}
              <Button
                variant="outline"
                disabled={!saved && stopped}
                onClick={() => {
                  void data.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span>Context (words per side)</span>
              <AnalysisNumberInput
                className="w-28"
                aria-label="Quotation context length"
                min={0}
                max={2000}
                value={context}
                onCommit={(value) => {
                  onSettings({ context: value });
                }}
              />
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  Metadata and fields ({selected.length + generated.length})
                  <ChevronDown data-icon="inline-end" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                aria-label="Quotation result columns"
                className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
              >
                <div className="flex flex-col gap-3">
                  <fieldset className="flex min-w-0 flex-col gap-2">
                    <legend className="mb-2 text-description text-label-secondary">
                      Source metadata
                    </legend>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSettings({
                          metadata: fields.filter((name) => name !== input.column),
                        });
                      }}
                    >
                      Select all metadata
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSettings({ metadata: [] });
                      }}
                    >
                      Select no metadata
                    </Button>
                    {fields
                      .filter((name) => name !== input.column)
                      .map((name) => (
                        <label key={name} className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            checked={selected.includes(name)}
                            onCheckedChange={(v) => {
                              onSettings({
                                metadata: v
                                  ? [...selected, name]
                                  : selected.filter((n) => n !== name),
                              });
                            }}
                          />
                          <span className="break-all">{name}</span>
                        </label>
                      ))}
                  </fieldset>
                  <fieldset className="flex min-w-0 flex-col gap-2">
                    <legend className="mb-2 text-description text-label-secondary">
                      Quotation fields
                    </legend>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSettings({ fields: [...quotationFields] });
                      }}
                    >
                      Select all fields
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSettings({ fields: [] });
                      }}
                    >
                      Select no fields
                    </Button>
                    {quotationFields.map((field) => (
                      <label key={field} className="flex items-center gap-2">
                        <Checkbox
                          checked={generated.includes(field)}
                          onCheckedChange={(v) => {
                            onSettings({
                              fields: v
                                ? [...generated, field]
                                : generated.filter((n) => n !== field),
                            });
                          }}
                        />
                        {field.replaceAll('_', ' ')}
                      </label>
                    ))}
                  </fieldset>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-3 text-label-secondary">
            {Object.entries(quoteColors).map(([kind, value]) => (
              <span
                key={kind}
                style={{
                  textDecoration: 'underline',
                  textDecorationColor: value,
                  textDecorationThickness: 2,
                }}
              >
                {kind}
              </span>
            ))}
          </div>
          <div className="min-w-0 border-l-4 pl-2" style={{ borderColor: color }}>
            <h3 className="break-all font-semibold">{displayInput.source.name}</h3>
            {
              <p className="text-description">
                {saved ? 'Saved result' : 'Document page'} · {displayed.documentCount} documents ·{' '}
                {displayed.matchCount} quotations
              </p>
            }
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-body">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr>
                  <th className="p-2 text-left">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSorting(input.column, true);
                      }}
                    >
                      Document
                      {sort?.field === input.column ? (sort.descending ? ' ↓' : ' ↑') : ''}
                    </Button>
                  </th>
                  {[
                    ...selected.map((field) => ({ field, metadata: true })),
                    ...generated.map((field) => ({ field, metadata: false })),
                  ].map(({ field, metadata }) => (
                    <th key={`${String(metadata)}-${field}`} className="p-2 text-left">
                      <Button
                        variant="ghost"
                        disabled={!metadata && (!saved || unit === 'documents')}
                        onClick={() => {
                          setSorting(field, metadata);
                        }}
                      >
                        {field}
                        {sort?.field === field ? (sort.descending ? ' ↓' : ' ↑') : ''}
                      </Button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, index) => (
                    <tr
                      key={`${row.documentId}-${String(row.quotes[0]?.quote_row_idx ?? index)}`}
                      className="cursor-pointer border-t border-surface-border hover:bg-list-hover"
                      onClick={(event) => {
                        inspectAnalysisRow(event, () => {
                          setDetail(index);
                        });
                      }}
                    >
                      <td className="min-w-56 max-w-3xl p-2">
                        <button
                          className="w-full whitespace-pre-wrap text-left"
                          aria-label={`Inspect document ${row.documentId}`}
                          onClick={() => {
                            if (!window.getSelection()?.toString()) setDetail(index);
                          }}
                        >
                          <QuotationText
                            text={showValue(row.source[displayInput.column] ?? '')}
                            quotes={row.quotes}
                            context={context}
                          />
                        </button>
                      </td>
                      {selected.map((field) => (
                        <td key={field} className="whitespace-pre-wrap p-2">
                          {quotationCell(row, field, false)}
                        </td>
                      ))}
                      {generated.map((field) => (
                        <td key={field} className="whitespace-pre-wrap p-2">
                          {quotationCell(row, field, true)}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="p-4 text-description"
                      colSpan={1 + selected.length + generated.length}
                    >
                      No quotations in this {saved ? 'result' : 'document page'}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePaginationFooter
            pageIndex={page - 1}
            pageSize={pageSize}
            onPageChange={(index) => {
              setPage(index + 1);
            }}
            onPageSizeChange={(size) => {
              setPageSizes({ ...pageSizes, [view]: size });
              setPage(1);
            }}
            rowCount={saved ? displayed.totalRows : undefined}
            hasNext={displayed.hasNext}
            pageSizeLabel={
              saved && unit === 'matches' ? 'Quotations per page' : 'Documents per page'
            }
            loading={data.isFetching}
          />
          {saved && result && (
            <AnalysisPublishMenu
              disabled={editing || stale}
              matchesLabel="Quotations"
              onSelect={setPublish}
            />
          )}
        </>
      </TabsContent>
      {detail !== null && (
        <QuotationDetail
          key={identity}
          base={base}
          analysisId={saved ? result?.id : undefined}
          column={displayInput.column}
          initialIndex={detail}
          rows={rows}
          page={page}
          hasNext={displayed.hasNext}
          loading={data.isFetching}
          error={data.error}
          sequenceKey={JSON.stringify([identity, unit, sort, pageSize])}
          onPage={setPage}
          onClose={() => {
            setDetail(null);
          }}
        />
      )}
      {publish && result && (
        <QuotationPublishDialog
          base={base}
          result={result}
          projection={publish}
          onClose={() => {
            setPublish(null);
          }}
        />
      )}
    </Tabs>
  );
}
function QuotationDetail({
  base,
  analysisId,
  column,
  initialIndex,
  rows,
  page,
  hasNext,
  loading,
  error,
  sequenceKey,
  onPage,
  onClose,
}: {
  base: string;
  analysisId?: string;
  column: string;
  initialIndex: number;
  rows: QuotationRow[];
  page: number;
  hasNext: boolean;
  loading: boolean;
  error: unknown;
  sequenceKey: string;
  onPage: (page: number) => void;
  onClose: () => void;
}) {
  const controller = useRowDetailDialog({
    sequenceKey,
    items: rows,
    page,
    hasPreviousPage: page > 1,
    hasNextPage: hasNext,
    loading,
    error,
    onPageChange: onPage,
    toPayload: (row) => ({ record: row.source, textColumn: column }),
  });
  const selected = controller.selectedItem;
  const query: quotationApi.QuotationQuery = {
    projection: 'documents',
    page: 1,
    page_size: 1,
    sort: null,
    document_id: selected?.documentId,
  };
  const full = useQuery({
    queryKey: ['native', base, 'analyses', analysisId, 'quotation', query],
    queryFn: ({ signal }) => quotationApi.queryQuotation(base, analysisId ?? '', query, signal),
    enabled: Boolean(analysisId && selected),
    staleTime: Infinity,
  });
  const quotes = full.data ? quotationRows(full.data.table)[0]?.quotes : selected?.quotes;
  const opened = useRef(false);
  const { openDetailAt } = controller;
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      openDetailAt(initialIndex);
    }
  }, [openDetailAt, initialIndex]);
  return (
    <RowDetailPanel
      open={controller.detailOpen}
      onOpenChange={(open) => {
        controller.setDetailOpen(open);
        if (!open) onClose();
      }}
      payload={controller.detailPayload}
      customization={{
        label: 'Quotation',
        renderDocumentText: (text) => <QuotationText text={text} quotes={quotes ?? []} />,
      }}
      navigation={controller.navigation}
    />
  );
}
function QuotationPublishDialog({
  base,
  result: initialResult,
  projection,
  onClose,
}: {
  base: string;
  result: quotationApi.QuotationAnalysisResult;
  projection: 'documents' | 'matches';
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [result] = useState(initialResult);
  const [name, setName] = useState(() =>
    suggestDataBlockName(
      [result.result.payload.input.source.name],
      projection === 'documents' ? 'qt_doc' : 'qt',
      cachedDataBlockNames(cache, base),
    ),
  );
  const [metadata, setMetadata] = useState<string[]>([]);
  const [fields, setFields] = useState<string[]>([...quotationFields]);
  const choices = result.result.payload.columns
    .map(([name]) => name)
    .filter((name) => name !== result.result.payload.input.column);
  const mutation = useMutation({
    mutationFn: () =>
      quotationApi.publishQuotation(base, result.id, { projection, name, metadata, fields }),
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Add {projection === 'matches' ? 'quotations' : 'documents'} to Project
          </DialogTitle>
          <DialogDescription>
            Creates an independent Table from every saved matching row. Existing objects are never
            overwritten.
          </DialogDescription>
        </DialogHeader>
        <p className="break-all">{result.result.payload.input.source.name}</p>
        <label>
          Table name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <p>
          Required: {result.result.payload.input.column}
          {projection === 'documents' ? ' and QUOTE_extraction' : ''}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setMetadata(choices);
              setFields([...quotationFields]);
            }}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMetadata([]);
              setFields([]);
            }}
          >
            Select none
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          {choices.map((field) => (
            <label key={field} className="flex items-center gap-2">
              <Checkbox
                checked={metadata.includes(field)}
                onCheckedChange={(v) => {
                  setMetadata(v ? [...metadata, field] : metadata.filter((n) => n !== field));
                }}
              />
              {field}
            </label>
          ))}
          {projection === 'matches' &&
            quotationFields.map((field) => (
              <label key={field} className="flex items-center gap-2">
                <Checkbox
                  checked={fields.includes(field)}
                  onCheckedChange={(v) => {
                    setFields(v ? [...fields, field] : fields.filter((n) => n !== field));
                  }}
                />
                {field.replaceAll('_', ' ')}
              </label>
            ))}
        </div>
        {mutation.isError && (
          <p role="alert">Could not create the Table. Your selections are retained.</p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
