import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import { decodeArrowData } from '@/lib/arrow/decodeArrowTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePaginationFooter } from '../common/components/TablePaginationFooter';
import { showValue } from '../common/analysisValue';

export function TopicDocuments({
  base,
  owner,
  summary,
  topic,
  count,
  topN,
  onClose,
}: {
  base: string;
  owner: { analysis: string } | { tab: string; preview: string };
  summary: api.TopicSummary;
  topic: number;
  count: number;
  topN: number;
  onClose: () => void;
}) {
  const [source, setSource] = useState(0);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [metadata, setMetadata] = useState<string[]>([]);
  const selected = summary.sources[source];
  const root =
    'analysis' in owner
      ? ['native', base, 'analyses', owner.analysis, 'topic-modeling', 'documents']
      : ['native', base, 'analysis-preview', owner.tab, owner.preview, 'documents'];
  const input: api.TopicDocumentQuery = {
    projection: 'documents',
    topic,
    topic_count: count,
    top_n: topN,
    source,
    page: page + 1,
    page_size: size,
    metadata,
  };
  const client = useQueryClient();
  const rows = useQuery({
    queryKey: [...root, base, owner, input],
    queryFn: ({ signal }) => api.queryTopicDocuments(base, owner, input, signal),
    staleTime: Infinity,
  });
  // Closing an inspector releases in-flight reads; immutable completed pages may be reused.
  useEffect(
    () => () => {
      void client.cancelQueries({
        queryKey: [
          'native',
          base,
          'analysis' in owner ? 'analyses' : 'analysis-preview',
          'analysis' in owner ? owner.analysis : owner.tab,
          ...('analysis' in owner ? ['topic-modeling', 'documents'] : [owner.preview, 'documents']),
        ],
      });
    },
    [client, base, owner],
  );
  if (!selected) return null;
  const decoded = rows.data ? decodeArrowData(rows.data.table).rows : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>Topic {topic} documents</DialogTitle>
          <DialogDescription>
            {'analysis' in owner ? 'Saved source snapshot' : 'Preview sample'} · Top {topN}{' '}
            memberships, including ties. Ordered by topic coverage. Read only.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={String(source)}
          onValueChange={(value) => {
            setSource(Number(value));
            setPage(0);
            setMetadata([]);
          }}
        >
          <TabsList className="h-auto max-w-full flex-wrap">
            {summary.sources.map((item, index) => (
              <TabsTrigger
                key={index}
                value={String(index)}
                className="max-w-full whitespace-normal break-words"
              >
                {item.input.source.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="self-start">
              Metadata ({metadata.length}) ▾
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 overflow-auto" align="start">
            <Button
              variant="ghost"
              onClick={() => {
                setMetadata(
                  selected.columns
                    .map(([name]) => name)
                    .filter((name) => name !== selected.input.column),
                );
                setPage(0);
              }}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMetadata([]);
                setPage(0);
              }}
            >
              Select none
            </Button>
            {selected.columns
              .filter(([name]) => name !== selected.input.column)
              .map(([name]) => (
                <label key={name} className="flex items-center gap-2 py-1 break-all">
                  <Checkbox
                    checked={metadata.includes(name)}
                    onCheckedChange={(value) => {
                      setMetadata((old) =>
                        value === true ? [...old, name] : old.filter((column) => column !== name),
                      );
                      setPage(0);
                    }}
                  />
                  {name}
                </label>
              ))}
          </PopoverContent>
        </Popover>
        {rows.isError ? (
          <p role="alert">
            Could not load these documents.{' '}
            <Button
              variant="outline"
              onClick={() => {
                void rows.refetch();
              }}
            >
              Retry
            </Button>
          </p>
        ) : rows.isPending ? (
          <p role="status">Loading documents…</p>
        ) : (
          <>
            <p className="text-description">
              {rows.data.totalRows.toLocaleString()} matching documents
            </p>
            <div className="min-h-0 overflow-auto">
              <table className="w-full text-body">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    <th className="p-2 text-left">Document</th>
                    <th className="p-2 text-left">Coverage</th>
                    {metadata.map((name) => (
                      <th key={name} className="p-2 text-left">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {decoded.map((row) => {
                    const values = row.source as Record<string, unknown>;
                    const text = showValue(values[selected.input.column]);
                    return (
                      <tr
                        key={String(row.document_id)}
                        className="border-b border-surface-border align-top"
                      >
                        <td className="min-w-64 max-w-xl p-2">
                          <details>
                            <summary className="cursor-pointer whitespace-pre-wrap break-words">
                              {Array.from(text).slice(0, 240).join('')}
                              {Array.from(text).length > 240 ? '…' : ''}
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap break-words">{text}</p>
                          </details>
                        </td>
                        <td className="whitespace-nowrap p-2">
                          {(Number(row.coverage) * 100).toFixed(2)}%
                        </td>
                        {metadata.map((name) => (
                          <td key={name} className="max-w-xs whitespace-pre-wrap break-words p-2">
                            {showValue(values[name])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!decoded.length && (
                <p>No documents have this topic among their positive Top-N memberships.</p>
              )}
            </div>
          </>
        )}
        <TablePaginationFooter
          table={{
            setPageIndex: setPage,
            setPageSize: (value) => {
              setSize(value);
              setPage(0);
            },
          }}
          pageIndex={page}
          pageSize={size}
          rowCount={rows.data?.totalRows}
          loading={rows.isFetching}
          pageSizeLabel="Documents per page"
        />
      </DialogContent>
    </Dialog>
  );
}
