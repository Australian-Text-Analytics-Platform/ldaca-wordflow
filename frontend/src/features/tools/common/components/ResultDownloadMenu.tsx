import { tableToIPC, type Table } from 'apache-arrow';
import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OperationError } from '@/features/project/OperationError';
import { saveGeneratedExport } from '@/lib/download';
import { useState } from 'react';
import { resultColumnKey, type ResultColumn } from '../resultColumns';

export function ResultDownloadMenu({
  base,
  id,
  selection,
  captured,
  topicPreview,
  columns,
  optionalColumns = [],
  document,
  disabled = false,
}: {
  base: string;
  id?: string;
  selection?: components['schemas']['ResultSelection'];
  captured?: Table;
  topicPreview?: { tab: string; id: string; query: components['schemas']['TopicDocumentQuery'] };
  columns: ResultColumn[];
  optionalColumns?: ResultColumn[];
  document: ResultColumn;
  disabled?: boolean;
}) {
  const [includeDocument, setIncludeDocument] = useState(true);
  const [extras, setExtras] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const download = async (format: components['schemas']['ExportFormat']) => {
    setPending(true);
    setError(null);
    try {
      let fields = [
        ...columns,
        ...optionalColumns.filter((column) => extras.includes(resultColumnKey(column))),
      ];
      if (
        includeDocument &&
        !fields.some((column) => resultColumnKey(column) === resultColumnKey(document))
      )
        fields = [document, ...fields];
      if (!includeDocument)
        fields = fields.filter(
          (column) =>
            resultColumnKey(column) !== resultColumnKey(document) &&
            (column.metadata || !/(^|_)(start|end)_idx$/.test(column.column)),
        );
      const response = topicPreview
        ? await request(
            base,
            '/api/project/tabs/{tab}/topic-modeling/previews/{id}/download',
            'post',
            {
              path: { tab: topicPreview.tab, id: topicPreview.id },
              body: { query: topicPreview.query, columns: fields, format },
            },
          )
        : captured
          ? await request(base, '/api/project/results/download', 'post', {
              body: {
                bytes: Array.from(tableToIPC(captured, 'stream')),
                document,
                columns: fields,
                format,
              },
            })
          : id && selection
            ? await request(base, '/api/project/analyses/{id}/download', 'post', {
                path: { id },
                body: { selection, columns: fields, format },
              })
            : null;
      if (!response) throw new Error('Choose a completed result to download');
      await saveGeneratedExport(await response.blob(), `results.${format}`);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="min-w-0">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={disabled || pending || !columns.length}>
            {pending
              ? 'Downloading…'
              : captured
                ? 'Download Preview'
                : topicPreview
                  ? 'Download sample'
                  : 'Download'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeDocument}
              onCheckedChange={(value) => setIncludeDocument(value === true)}
            />
            Include document
          </label>
          {!includeDocument && (
            <p className="text-description">Document position fields are omitted too.</p>
          )}
          {optionalColumns.map((column) => {
            const key = resultColumnKey(column);
            return (
              <label key={key} className="flex items-center gap-2">
                <Checkbox
                  checked={extras.includes(key)}
                  disabled={!includeDocument && /(^|_)(start|end)_idx$/.test(column.column)}
                  onCheckedChange={(value) =>
                    setExtras((previous) =>
                      value === true ? [...previous, key] : previous.filter((item) => item !== key),
                    )
                  }
                />
                {column.column}
              </label>
            );
          })}
          {(['csv', 'xlsx', 'json', 'parquet'] as const).map((format) => (
            <Button
              key={format}
              variant="ghost"
              disabled={pending}
              onClick={() => {
                void download(format);
              }}
            >
              {format.toUpperCase()}
            </Button>
          ))}
          <p className="text-description text-label-secondary">
            {captured
              ? 'Only the completed current Preview page. Downloading makes no additional analysis or provider calls.'
              : topicPreview
                ? 'All matching documents in this Preview sample, without refitting.'
                : 'All matching pages, using the current filters and sorting.'}
          </p>
        </PopoverContent>
      </Popover>
      {error !== null && <OperationError title="Could not download results" error={error} />}
    </div>
  );
}
