import { useEffect, useEffectEvent, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { File, FolderOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isTauri } from '@/lib/isTauri';
import { reportProjectError } from './projectErrors';
import * as api from './api';

const RECENTS_KEY = 'wordflow.desktop.recentDataFiles';
function readRecents(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 10)
      : [];
  } catch {
    return [];
  }
}
function reader(path: string) {
  switch (path.split('.').at(-1)?.toLowerCase()) {
    case 'parquet':
      return 'read_parquet';
    case 'json':
    case 'jsonl':
    case 'ndjson':
      return 'read_json';
    case 'csv':
    case 'tsv':
      return 'read_csv';
    default:
      throw new Error('Choose a CSV, TSV, Parquet, JSON, JSONL or NDJSON data file.');
  }
}
const filename = (path: string) => path.split(/[\\/]/).at(-1) ?? path;
const icons: Record<string, string> = {
  csv: 'table',
  tsv: 'table',
  parquet: 'database',
  json: 'json',
  jsonl: 'json',
  ndjson: 'json',
};
function fileSize(bytes: number) {
  const unit = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit ? 1 : 0 }).format(bytes / 1024 ** unit)} ${String(['B', 'KB', 'MB', 'GB', 'TB'][unit])}`;
}

export function LocalFileImport({
  base,
  dropped,
  onDropHandled,
}: {
  base: string;
  dropped: string[];
  onDropHandled: () => void;
}) {
  const [path, setPath] = useState('');
  const [recent, setRecent] = useState(readRecents);
  const cache = useQueryClient();
  const metadataKey = [base, 'local-file-metadata'];
  const metadata = useQuery({
    queryKey: [base, 'local-file-metadata', recent],
    queryFn: ({ signal }) => api.localFileMetadata(base, recent, signal),
    enabled: recent.length > 0,
  });
  const mutationKey = [base, 'local-file-import'];
  const pending = useIsMutating({ mutationKey });
  const imported = useMutation({
    mutationKey,
    mutationFn: (paths: string[]) =>
      api.importTables(
        base,
        paths.map((file) => ({
          table_name: filename(file).replace(/\.[^.]+$/, ''),
          sql: `SELECT * FROM ${reader(file)}(?)`,
          parameters: [file],
        })),
      ),
    onSuccess: (_result, paths) => {
      const next = [...new Set([...paths, ...readRecents()])].slice(0, 10);
      setRecent(next);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* Optional device preference. */
      }
      setPath((current) => (paths.includes(current.trim()) ? '' : current));
      void cache.invalidateQueries({ queryKey: metadataKey });
    },
  });
  function importPaths(paths: string[]) {
    const unique = [...new Set(paths.filter((file) => file.trim()))];
    if (unique.length) imported.mutate(unique);
  }
  const receiveDrop = useEffectEvent((paths: string[]) => {
    importPaths(paths);
    onDropHandled();
  });
  useEffect(() => {
    if (dropped.length) receiveDrop(dropped);
  }, [dropped]);
  async function choose() {
    if (!isTauri()) {
      importPaths([path.trim()]);
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Data', extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson'] },
        ],
      });
      if (selected) importPaths(typeof selected === 'string' ? [selected] : selected);
    } catch (error) {
      reportProjectError(error, 'Could not choose files');
    }
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="local-file-content">
      <div className="flex flex-col gap-6 pb-3">
        <section className="space-y-3 rounded-md border border-dashed border-surface-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-body font-semibold">
              <FolderOpen className="size-5 shrink-0 text-description" />
              Drop data files here
            </h2>
            <Button
              onClick={() => {
                void choose();
              }}
              disabled={!isTauri() && !path.trim()}
            >
              <FolderOpen /> Choose files…
            </Button>
          </div>
          {!isTauri() && (
            <Input
              aria-label="Data file path"
              placeholder="Absolute file path on this computer"
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && path.trim()) importPaths([path.trim()]);
              }}
            />
          )}
          <p className="text-body-secondary text-description">
            CSV, TSV, Parquet, JSON, JSONL and NDJSON. Files import immediately, with all columns
            copied into the project.
          </p>
        </section>
        {pending > 0 && (
          <p role="status" className="text-body-secondary text-description">
            Importing files… Follow progress or cancel in Tasks.
          </p>
        )}
        {recent.length > 0 && (
          <section aria-label="Recent files" className="min-w-0">
            <h2 className="mb-2 text-body font-semibold">Recent files</h2>
            <ul className="divide-y divide-surface-border">
              {recent.map((file) => {
                const name = filename(file);
                const parent = file.slice(0, -name.length);
                const icon = icons[file.split('.').at(-1)?.toLowerCase() ?? ''];
                const size = metadata.data?.find((item) => item.path === file)?.size_bytes;
                return (
                  <li key={file} className="flex min-w-0 items-center">
                    <Button
                      variant="ghost"
                      className="h-auto! w-full justify-start gap-3 whitespace-normal px-2 py-3 text-left"
                      aria-label={`Import ${name}`}
                      title={file}
                      onClick={() => {
                        importPaths([file]);
                      }}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-wordflow-file', file);
                      }}
                    >
                      {icon ? (
                        <img
                          src={`/icons/material/${icon}.svg`}
                          alt=""
                          draggable={false}
                          className="size-6 shrink-0"
                        />
                      ) : (
                        <File className="size-6 shrink-0" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="truncate text-body font-medium">{name}</span>
                        <span className="flex min-w-0 items-baseline gap-3 text-body-secondary text-description">
                          <span className="min-w-0 flex-1 truncate">{parent}</span>
                          <span className="shrink-0 tabular-nums">
                            {size != null
                              ? fileSize(size)
                              : metadata.isPending
                                ? '…'
                                : metadata.isError
                                  ? 'Size unavailable'
                                  : 'File unavailable'}
                          </span>
                        </span>
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={`Remove ${name} from recent files`}
                      onClick={() => {
                        const next = recent.filter((path) => path !== file);
                        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
                        setRecent(next);
                      }}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
