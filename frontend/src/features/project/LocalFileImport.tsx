import type { NativeTask } from './tasksApi';
import { RunError } from '@/features/tools/common/components/RunError';
import {
  getPreferences,
  patchPreferences,
  usePreferences,
} from '@/features/preferences/preferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as filesApi from '@/features/project/filesApi';
import { isTauri } from '@/lib/isTauri';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { File, FolderOpen, X } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { OperationError } from './OperationError';
import { FileImportSelection, SkippedImportFiles } from './FileImportSelection';

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
  active,
  tasks,
  onDropHandled,
}: {
  base: string;
  dropped: string[];
  active: boolean;
  tasks: NativeTask[];
  onDropHandled: () => void;
}) {
  const [path, setPath] = useState('');
  const [chooserError, setChooserError] = useState<unknown>(null);
  const [plans, setPlans] = useState<
    Array<{ id: string; paths: string[]; plan: filesApi.FileImportPlan }>
  >([]);
  const recent = usePreferences().recentDataFiles;
  const cache = useQueryClient();
  const metadataKey = [base, 'local-file-metadata'];
  const metadata = useQuery({
    queryKey: [base, 'local-file-metadata', recent],
    queryFn: ({ signal }) => filesApi.localFileMetadata(base, recent, signal),
    enabled: recent.length > 0,
  });
  const mutationKey = [base, 'local-file-import'];
  const pending = useIsMutating({ mutationKey });
  const imported = useMutation({
    mutationKey,
    meta: { reportError: false },
    mutationFn: (input: filesApi.FileImportRequest) => filesApi.importFiles(base, input),
    onSuccess: (_result, { paths }) => {
      const next = [...new Set([...paths, ...getPreferences().recentDataFiles])].slice(0, 10);
      void patchPreferences({ recentDataFiles: next }).catch(() => undefined);
      setPath((current) => (paths.includes(current.trim()) ? '' : current));
      void cache.invalidateQueries({ queryKey: metadataKey });
    },
  });
  const inspected = useMutation({
    meta: { reportError: false },
    mutationFn: async (paths: string[]) => filesApi.inspectFileImport(base, { paths }),
    onSuccess: (plan, paths) => {
      if (filesApi.needsFileImportSelection(plan)) {
        setPlans((previous) => [...previous, { id: crypto.randomUUID(), paths, plan }]);
      } else {
        imported.mutate({ paths });
      }
    },
  });
  function importPaths(paths: string[]) {
    const unique = [...new Set(paths.filter((file) => file.trim()))];
    if (unique.length) inspected.mutate(unique);
  }
  const receiveDrop = useEffectEvent((paths: string[]) => {
    importPaths(paths);
    onDropHandled();
  });
  useEffect(() => {
    if (dropped.length) receiveDrop(dropped);
  }, [dropped]);
  async function choose(directory = false) {
    if (!isTauri()) {
      importPaths([path.trim()]);
      return;
    }
    try {
      const selected = await open({
        directory,
        multiple: true,
        filters: [
          {
            name: 'Data',
            extensions: [
              'csv',
              'tsv',
              'parquet',
              'json',
              'jsonl',
              'ndjson',
              'avro',
              'arrow',
              'ipc',
              'feather',
              'xlsx',
              'xls',
              'xlsm',
              'xlsb',
              'ods',
              'txt',
              'text',
              'md',
              'rst',
              'log',
              'zip',
            ],
          },
        ],
      });
      if (selected) importPaths(typeof selected === 'string' ? [selected] : selected);
    } catch (error) {
      setChooserError(error);
    }
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="local-file-content">
      <div className="flex flex-col gap-6 pb-3">
        <section className="space-y-3 rounded-md border border-dashed border-surface-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-body font-semibold">
              <FolderOpen className="size-5 shrink-0 text-description" />
              Drop data files or folders here
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
          {isTauri() && (
            <Button
              variant="outline"
              onClick={() => {
                void choose(true);
              }}
            >
              <FolderOpen />
              Choose folders…
            </Button>
          )}
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
            Tables, spreadsheets, Arrow and Avro files, text folders and ZIPs. Text files combine
            into one Data Block; tables and workbook sheets import separately.
          </p>
        </section>
        {plans[0] && (
          <FileImportSelection
            key={plans[0].id}
            plan={plans[0].plan}
            onCancel={() => setPlans((previous) => previous.slice(1))}
            onImport={(selected) => {
              const current = plans[0];
              if (!current) return;
              imported.mutate({ paths: current.paths, selected });
              setPlans((previous) => previous.slice(1));
            }}
          />
        )}
        {chooserError != null && (
          <OperationError title="Could not choose files" error={chooserError} />
        )}
        {inspected.error && (
          <OperationError
            title="Could not inspect files"
            error={inspected.error}
            onRetry={() => inspected.mutate(inspected.variables)}
          />
        )}
        <RunError
          name="Import"
          title="Could not import files"
          taskLabel="Import local data"
          tasks={tasks}
          active={active}
          busy={imported.isPending}
          error={imported.error}
          onRetry={
            imported.error && imported.variables
              ? () => {
                  if (imported.variables) imported.mutate(imported.variables);
                }
              : undefined
          }
        />
        {imported.data && <SkippedImportFiles files={imported.data.skipped} />}
        {(pending > 0 || inspected.isPending) && (
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
                        void patchPreferences({ recentDataFiles: next }).catch(() => undefined);
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
