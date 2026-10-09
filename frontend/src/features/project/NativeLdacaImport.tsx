import type { NativeTask } from './tasksApi';
import { RunError } from '@/features/tools/common/components/RunError';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as filesApi from '@/features/project/filesApi';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { create } from 'zustand';
import { OperationError } from './OperationError';
import { externalLink } from '@/lib/externalLink';

const useAccess = create<{ token: string }>(() => ({ token: '' }));

function portalUrl(record: filesApi.OniSearchResult) {
  const identifier = record.crate_id?.trim() ? record.crate_id : record.id;
  if (/^https?:\/\//i.test(identifier)) return identifier;
  return `https://data.ldaca.edu.au/collection?id=${encodeURIComponent(identifier)}&_crateId=${encodeURIComponent(record.crate_id ?? identifier)}`;
}

export default function NativeLdacaImport({
  base,
  active,
  tasks = [],
}: {
  base: string;
  active: boolean;
  tasks?: NativeTask[];
}) {
  const token = useAccess((state) => state.token);
  const [filterText, setFilterText] = useState('');
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<'keyword' | 'identifier'>('keyword');
  const [collection, setCollection] = useState('all');
  const [format, setFormat] = useState('all');
  const catalogue = useQuery({
    meta: { reportError: false },
    queryKey: [base, 'ldaca-catalogue'],
    queryFn: ({ signal }) => filesApi.browseLdaca(base, token, signal),
    enabled: active,
    staleTime: Infinity,
    retry: false,
  });
  const search = useMutation({
    meta: { reportError: false },
    mutationFn: (input: { method: 'keyword' | 'identifier'; query: string; token: string }) =>
      filesApi.searchLdaca(base, input.method, input.query, input.token),
    onSuccess: () => {
      setCollection('all');
      setFormat('all');
    },
  });
  const imported = useMutation({
    meta: { reportError: false },
    mutationFn: (input: { id: string; token: string; metadataOnly: boolean }) =>
      filesApi.importLdaca(base, input.id, input.token || undefined, input.metadataOnly),
  });
  const records = search.data ?? catalogue.data ?? [];
  const options = (field: 'collections' | 'file_formats') =>
    [...new Set(records.flatMap((record) => record[field] ?? []))].sort();
  const collections = options('collections');
  const formats = options('file_formats');
  const filtered = records.filter(
    (record) =>
      `${record.title} ${record.description ?? ''} ${record.id}`
        .toLocaleLowerCase()
        .includes(filterText.toLocaleLowerCase()) &&
      (collection === 'all' || record.collections?.includes(collection)) &&
      (format === 'all' || record.file_formats?.includes(format)),
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-5">
      <div className="flex flex-col gap-4">
        <p className="text-body text-description">
          Browse the{' '}
          <a
            className="underline underline-offset-2"
            href="https://data.ldaca.edu.au"
            onClick={externalLink}
            target="_blank"
            rel="noreferrer"
          >
            LDaCA Data Portal
          </a>{' '}
          and import a collection into this project.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim() && !search.isPending) search.mutate({ method, query, token });
          }}
        >
          <label className="flex flex-col gap-1 text-label-secondary">
            Search by
            <Select
              value={method}
              onValueChange={(value) => {
                setMethod(value as typeof method);
              }}
            >
              <SelectTrigger aria-label="Search by" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="identifier">ID</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1 text-label-secondary">
            Search
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={method === 'keyword' ? 'Search collections…' : 'arcp://…'}
            />
          </label>
          <Button type="submit" disabled={!query.trim() || search.isPending}>
            <Search />
            {search.isPending ? 'Searching…' : 'Search'}
          </Button>
        </form>
        <Collapsible className="flex flex-col gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group w-fit">
              <ChevronRight className="group-data-[state=open]:rotate-90" />
              Access token{token ? ' · Set' : ' · Optional'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <label className="flex flex-col gap-1 text-body">
              LDaCA access token
              <Input
                aria-label="LDaCA access token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => {
                  useAccess.setState({ token: event.target.value });
                }}
              />
              <span className="text-label-secondary text-description">
                For collections that require access. Kept in this window only, never saved in the
                project.
              </span>
            </label>
          </CollapsibleContent>
        </Collapsible>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-label-secondary">
            Filter collections
            <Input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Filter loaded names and descriptions…"
            />
          </label>
          <Button
            variant="outline"
            disabled={catalogue.isFetching}
            onClick={() => {
              search.reset();
              void catalogue.refetch();
            }}
          >
            Refresh collections
          </Button>
        </div>
        {catalogue.isFetching && <p role="status">Loading the LDaCA catalogue…</p>}
        {active && catalogue.error && catalogue.error.name !== 'AbortError' && (
          <OperationError
            title="Could not load collections"
            error={catalogue.error}
            onRetry={() => {
              void catalogue.refetch();
            }}
          />
        )}
        {search.isPending && (
          <p role="status" className="text-body text-description">
            Searching the LDaCA catalogue…
          </p>
        )}
        {search.error && (
          <OperationError
            title="Could not search LDaCA"
            error={search.error}
            onRetry={() => search.mutate(search.variables)}
          />
        )}
        {(search.isSuccess || catalogue.isSuccess) && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="mr-auto text-body font-semibold">
                {filtered.length} of {records.length} results
              </h2>
              {[
                { label: 'Collection', values: collections, value: collection, set: setCollection },
                { label: 'File type', values: formats, value: format, set: setFormat },
              ]
                .filter((filter) => filter.values.length)
                .map((filter) => (
                  <label
                    key={filter.label}
                    className="flex min-w-0 flex-col gap-1 text-label-secondary"
                  >
                    {filter.label}
                    <Select value={filter.value} onValueChange={filter.set}>
                      <SelectTrigger aria-label={filter.label} className="w-full max-w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">
                            All {filter.label === 'Collection' ? 'collections' : 'file types'}
                          </SelectItem>
                          {filter.values.map((value) => (
                            <SelectItem value={value} key={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                ))}
            </div>
            <div className="divide-y">
              {filtered.map((record) => (
                <article
                  key={record.id}
                  className="flex min-w-0 flex-col gap-2 py-4 first:pt-0"
                  aria-label={record.title}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-[1_1_12rem] break-words text-body font-semibold">
                      <a
                        href={portalUrl(record)}
                        onClick={externalLink}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {record.title}
                        <ExternalLink className="ml-1 inline size-3.5" />
                      </a>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!record.importable || imported.isPending}
                        onClick={() => {
                          imported.mutate({
                            id: record.crate_id ?? record.id,
                            token,
                            metadataOnly: false,
                          });
                        }}
                      >
                        {imported.isPending &&
                        !imported.variables.metadataOnly &&
                        imported.variables.id === (record.crate_id ?? record.id)
                          ? 'Importing…'
                          : 'Import'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={imported.isPending}
                        onClick={() =>
                          imported.mutate({
                            id: record.crate_id ?? record.id,
                            token,
                            metadataOnly: true,
                          })
                        }
                      >
                        {imported.isPending &&
                        imported.variables.metadataOnly &&
                        imported.variables.id === (record.crate_id ?? record.id)
                          ? 'Importing metadata…'
                          : 'Import metadata only'}
                      </Button>
                    </div>
                  </div>
                  {record.description && (
                    <p className="line-clamp-2 break-words text-body text-description">
                      {record.description}
                    </p>
                  )}
                  {!!record.file_formats?.length && (
                    <p className="break-words text-label-secondary text-description">
                      {record.file_formats.join(' · ')}
                    </p>
                  )}
                  {!!record.access?.length && (
                    <p className="break-words text-label-secondary text-description">
                      Access: {record.access.join(', ')}
                    </p>
                  )}
                  {record.license && (
                    <p className="break-all text-label-secondary text-description">
                      Licence: {record.license}
                    </p>
                  )}
                  {!record.importable && (
                    <p className="text-label-secondary text-description">
                      Text requires access. Public metadata can be imported separately.
                    </p>
                  )}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="group w-fit">
                        <ChevronRight className="group-data-[state=open]:rotate-90" />
                        Details
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-2 py-2 text-label-secondary text-description">
                      <p className="break-all">
                        {record.crate_id?.trim() ? record.crate_id : record.id}
                      </p>
                      {record.description && (
                        <p className="whitespace-pre-wrap break-words">{record.description}</p>
                      )}
                      {!!record.types?.length && <p>{record.types.join(', ')}</p>}
                    </CollapsibleContent>
                  </Collapsible>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <p className="text-body text-description">
                {records.length
                  ? 'No results match these filters.'
                  : 'No collections found. Try another keyword or collection ID.'}
              </p>
            )}
          </>
        )}
        {imported.isPending && (
          <p role="status" className="text-body text-description">
            Importing collection — follow progress or cancel in Tasks. You can switch sources.
          </p>
        )}
        <RunError
          name="Import"
          title="Could not import collection"
          taskLabel="Import from LDaCA"
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
        {!!imported.data?.replaced_paths.length && (
          <div role="status" className="text-body-secondary">
            <p>
              Invalid text encoding was replaced in {imported.data.replaced_paths.length} files.
              Their rows were retained.
            </p>
            <details>
              <summary>Affected files</summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">
                {imported.data.replaced_paths.slice(0, 100).join('\n')}
                {imported.data.replaced_paths.length > 100
                  ? '\nAdditional files omitted from this display.'
                  : ''}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
