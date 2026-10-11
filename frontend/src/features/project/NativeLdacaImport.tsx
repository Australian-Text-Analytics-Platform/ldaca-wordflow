import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { useHostServices } from '@/features/settings/HostSettings';
import { portalInfo } from '@/features/settings/portalApi';

function portalUrl(record: filesApi.OniSearchResult) {
  const identifier = record.crate_id?.trim() ? record.crate_id : record.id;
  if (/^https?:\/\//i.test(identifier)) return identifier;
  return `https://data.ldaca.edu.au/collection?id=${encodeURIComponent(identifier)}&_crateId=${encodeURIComponent(record.crate_id ?? identifier)}`;
}

export default function NativeLdacaImport({ base }: { base: string }) {
  const host = useHostServices();
  const client = useQueryClient();
  const portal = useQuery(
    {
      queryKey: ['host', host?.base ?? base, 'portal'],
      queryFn: ({ signal }) => portalInfo(host?.base ?? base, signal),
    },
    host?.client ?? client,
  );
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<'keyword' | 'identifier'>('keyword');
  const [collection, setCollection] = useState('all');
  const [format, setFormat] = useState('all');
  const search = useMutation({
    mutationFn: (input: { method: 'keyword' | 'identifier'; query: string }) =>
      filesApi.searchLdaca(base, input.method, input.query),
    onSuccess: () => {
      setCollection('all');
      setFormat('all');
    },
  });
  const imported = useMutation({
    mutationFn: (input: { id: string }) => filesApi.importLdaca(base, input.id),
  });
  const records = search.data ?? [];
  const options = (field: 'collections' | 'file_formats') =>
    [...new Set(records.flatMap((record) => record[field] ?? []))].sort();
  const collections = options('collections');
  const formats = options('file_formats');
  const filtered = records.filter(
    (record) =>
      (collection === 'all' || record.collections?.includes(collection)) &&
      (format === 'all' || record.file_formats?.includes(format)),
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-5">
      <div className="flex flex-col gap-4">
        <p className="text-body text-description">
          Search the{' '}
          <a
            className="underline underline-offset-2"
            href="https://data.ldaca.edu.au"
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
            if (query.trim() && !search.isPending) search.mutate({ method, query });
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
        <div className="flex flex-wrap items-center gap-2 text-description text-body-secondary">
          <span>
            {portal.data?.has_credential
              ? 'Portal token configured'
              : 'Public access · no Portal token'}
          </span>
          <Button
            variant="outline"
            disabled={!host}
            onClick={(event) => host?.openSettings('portal', event.currentTarget)}
          >
            Manage Portal access
          </Button>
        </div>
        {search.isPending && (
          <p role="status" className="text-body text-description">
            Searching the LDaCA catalogue…
          </p>
        )}
        {search.isError && (
          <p role="status" className="text-body text-description">
            Search could not finish. Check your query or access token and try again.
          </p>
        )}
        {search.isIdle && (
          <p className="py-6 text-body text-description">
            Search by keyword or collection ID to find data to import.
          </p>
        )}
        {search.isSuccess && (
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
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {record.title}
                        <ExternalLink className="ml-1 inline size-3.5" />
                      </a>
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      data-guidance-stage="action"
                      disabled={!record.importable || imported.isPending}
                      onClick={() => {
                        imported.mutate({ id: record.id });
                      }}
                    >
                      {imported.isPending && imported.variables.id === record.id
                        ? 'Importing…'
                        : 'Import'}
                    </Button>
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
                      This record cannot be imported.
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
      </div>
    </div>
  );
}
