import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookText } from 'lucide-react';

import { getCorpusOverview } from '@/api';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CorpusOverviewPopoverProps {
  workspaceId: string;
  nodeId: string;
  /** Rows and columns of the Data Block, when known. */
  shape: readonly [number | null, number | null] | null;
  textColumns: readonly string[];
  /** The Data Block's document column, chosen first when it is text. */
  documentColumn: string | null;
  buttonClassName: string;
}

const formatCount = (value: number) => value.toLocaleString();
const formatMean = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * A short corpus overview of one text column (issue 327): documents, empty
 * and duplicate documents, and document lengths in words (or characters for
 * text with few spaces). It is read only while open, never for every Data
 * Block, and always from the current data.
 * Rendered by: WorkspaceDataHeader.
 */
export function CorpusOverviewPopover({
  workspaceId,
  nodeId,
  shape,
  textColumns,
  documentColumn,
  buttonClassName,
}: CorpusOverviewPopoverProps) {
  const [open, setOpen] = useState(false);
  const [chosenColumn, setChosenColumn] = useState<string | null>(null);
  const column =
    chosenColumn && textColumns.includes(chosenColumn)
      ? chosenColumn
      : documentColumn && textColumns.includes(documentColumn)
        ? documentColumn
        : (textColumns[0] ?? null);

  const overviewQuery = useQuery({
    queryKey: ['workspaces', workspaceId, 'nodes', nodeId, 'corpus-overview', column],
    enabled: open && column !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data } = await getCorpusOverview({
        path: { workspace_id: workspaceId, node_id: nodeId },
        query: { column: column ?? '' },
        signal,
        throwOnError: true,
      });
      return data;
    },
  });
  const overview = overviewQuery.data;
  const unit = overview?.unit === 'characters' ? 'Characters' : 'Words';
  const [rows, columns] = shape ?? [null, null];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={buttonClassName}>
          <BookText className="h-3 w-3" />
          Overview
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-body">
        {rows !== null && columns !== null ? (
          <p className="font-semibold">
            {formatCount(rows)} rows × {formatCount(columns)} columns
          </p>
        ) : null}
        {column === null ? (
          <p className="text-description">This Data Block has no text column to describe.</p>
        ) : (
          <>
            {textColumns.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-description">Text column</span>
                <Select value={column} onValueChange={setChosenColumn}>
                  <SelectTrigger aria-label="Text column" className="h-7 min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {textColumns.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-description">Text column: {column}</p>
            )}
            {overviewQuery.isError ? (
              <ErrorNotice error={overviewQuery.error} fallback="Couldn't read this column." />
            ) : overview ? (
              <>
                <dl
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums"
                  aria-label="Corpus overview"
                >
                  <dt>Documents</dt>
                  <dd className="text-right">{formatCount(overview.documents)}</dd>
                  <dt>Empty documents</dt>
                  <dd className="text-right">{formatCount(overview.empty_documents)}</dd>
                  <dt>Duplicate documents</dt>
                  <dd className="text-right">{formatCount(overview.duplicate_documents)}</dd>
                  <dt>{unit}</dt>
                  <dd className="text-right">{formatCount(overview.total)}</dd>
                  {overview.minimum !== null &&
                  overview.median !== null &&
                  overview.mean !== null &&
                  overview.maximum !== null ? (
                    <>
                      <dt>{unit} per document</dt>
                      <dd className="text-right" />
                      <dt className="pl-3 text-description">shortest</dt>
                      <dd className="text-right">{formatCount(overview.minimum)}</dd>
                      <dt className="pl-3 text-description">median</dt>
                      <dd className="text-right">{formatMean(overview.median)}</dd>
                      <dt className="pl-3 text-description">mean</dt>
                      <dd className="text-right">{formatMean(overview.mean)}</dd>
                      <dt className="pl-3 text-description">longest</dt>
                      <dd className="text-right">{formatCount(overview.maximum)}</dd>
                    </>
                  ) : null}
                </dl>
                <p className="text-label-secondary text-description">
                  {overview.unit === 'characters'
                    ? 'This text has few spaces, so it is measured in characters.'
                    : 'Words are counted between spaces, without a tokeniser.'}{' '}
                  Lengths leave out empty documents.
                </p>
              </>
            ) : (
              <p className="text-description" aria-live="polite">
                Counting…
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
