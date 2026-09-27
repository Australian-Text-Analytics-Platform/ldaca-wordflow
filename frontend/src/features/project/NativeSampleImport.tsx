import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SampleCollectionList } from '@/features/tools/data-loader/components/SampleCollectionList';
import * as api from './api';

export default function NativeSampleImport({ base, active }: { base: string; active: boolean }) {
  const imported = useMutation({
    mutationFn: (input: api.SampleImportRequest) => api.importSamples(base, input),
    onSuccess: () => {
      setSelected([]);
    },
  });
  const busy = imported.isPending;
  const [selected, setSelected] = useState<string[]>([]);
  const [asViews, setAsViews] = useState(true);
  const catalogue = useQuery({
    queryKey: ['sample-catalogue', base],
    queryFn: ({ signal }) => api.sampleCatalogue(base, signal),
    enabled: active,
    staleTime: 0,
    retry: false,
  });
  const collections = (catalogue.data?.collections ?? []).map((collection) => ({
    ...collection,
    files: collection.files.filter((file) => file.path.endsWith('.parquet')),
  }));
  const selectedFiles = collections
    .flatMap((collection) => collection.files)
    .filter((file) => selected.includes(file.path))
    .map((file) => file.path);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-5">
        <p className="mb-4 text-body text-description">
          Choose sample files for this project. Expand a collection to select individual files.
        </p>
        {catalogue.isPending && (
          <div
            role="status"
            aria-label="Loading sample collections"
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {catalogue.isError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-body text-description">Sample collections could not be loaded.</p>
            <Button
              variant="outline"
              onClick={() => {
                void catalogue.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        )}
        {catalogue.data && (
          <div>
            <SampleCollectionList
              collections={collections}
              disabled={busy}
              checked={(col) => {
                const count = col.files.filter((file) => selected.includes(file.path)).length;
                return count === 0 ? false : count === col.files.length ? true : 'indeterminate';
              }}
              onToggle={(id) => {
                const paths =
                  collections.find((col) => col.id === id)?.files.map((file) => file.path) ?? [];
                setSelected((current) =>
                  paths.every((path) => current.includes(path))
                    ? current.filter((path) => !paths.includes(path))
                    : [...new Set([...current, ...paths])],
                );
              }}
              renderFiles={(col) => (
                <fieldset className="flex min-w-0 flex-col gap-3 pb-1">
                  <legend className="sr-only">Files in {col.name}</legend>
                  {col.files.map((file) => (
                    <label
                      key={file.path}
                      className="flex min-w-0 cursor-pointer items-start gap-2 text-label-secondary"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.includes(file.path)}
                        disabled={busy}
                        onCheckedChange={(checked) => {
                          setSelected((current) =>
                            checked === true
                              ? [...current, file.path]
                              : current.filter((path) => path !== file.path),
                          );
                        }}
                      />
                      <span className="min-w-0 break-all" title={file.path}>
                        {file.path.split('/').at(-1)}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            />
          </div>
        )}
        {catalogue.isSuccess && !collections.length && (
          <p className="text-body text-description">No sample files are available.</p>
        )}
      </div>
      <footer className="flex shrink-0 flex-col gap-3 border-t pt-3">
        <div className="flex shrink-0 items-start gap-2">
          <Checkbox
            id="sample-import-as-views"
            className="mt-0.5"
            checked={asViews}
            disabled={busy}
            aria-describedby="sample-import-mode-description"
            onCheckedChange={(checked) => {
              setAsViews(checked === true);
            }}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sample-import-as-views">Import as views</Label>
            <p
              id="sample-import-mode-description"
              className="text-label-secondary text-description"
            >
              {asViews
                ? 'Views read data online from a pinned revision. Internet access is required to query them.'
                : 'Tables store a copy of the data in your project for offline use.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="mr-auto self-center text-label-secondary text-description"
            aria-live="polite"
          >
            {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
          </span>
          <Button
            disabled={busy || catalogue.isFetching || catalogue.isError || !selectedFiles.length}
            onClick={() => {
              imported.mutate({ file_paths: selectedFiles, as_views: asViews });
            }}
          >
            {busy ? 'Importing…' : 'Import selected'}
          </Button>
        </div>
        {busy && (
          <p role="status" className="text-label-secondary text-description">
            Follow progress or cancel in Tasks. You can switch sources while importing.
          </p>
        )}
      </footer>
    </>
  );
}
