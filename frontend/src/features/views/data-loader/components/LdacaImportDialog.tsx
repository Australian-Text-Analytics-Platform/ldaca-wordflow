import { Download, KeyRound, Loader2, Lock, Search } from 'lucide-react';

import type { OniSearchResult as LdacaCollection } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataPortalCredentialPanel } from '@/features/provider-credentials/components/DataPortalCredentialPanel';
import { filterLdacaCollections } from '../hooks/ldacaImportState';

const LDACA_PORTAL_COLLECTION_URL = 'https://data.ldaca.edu.au/collection';

export interface LdacaImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: string;
  onFilterChange: (filter: string) => void;
  collections: LdacaCollection[];
  collectionsLoading: boolean;
  tokenPanelOpen: boolean;
  onTokenPanelOpenChange: (open: boolean) => void;
  /** Re-checks collection access after the API token changes. */
  onTokenChanged: () => void;
  importingId?: string;
  importing: boolean;
  errorMessage?: string;
  onImport: (recordId: string, metadataOnly: boolean) => void;
}

/** Portal page for one collection, so users can inspect it before importing. */
function ldacaRecordUrl(record: LdacaCollection) {
  // crate_id may be '' on malformed records and must fall through to id to build a valid URL
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const identifier = record.crate_id || record.id;
  if (/^https?:\/\//i.test(identifier)) return identifier;
  const encodedIdentifier = encodeURIComponent(identifier);
  const encodedCrateId = encodeURIComponent(record.crate_id ?? identifier);
  return `${LDACA_PORTAL_COLLECTION_URL}?id=${encodedIdentifier}&_crateId=${encodedCrateId}`;
}

/** The last path segment of a licence group URL reads better than the URL. */
function accessGroupLabel(group: string) {
  const parts = group.replace(/\/+$/, '').split('/');
  return parts.slice(-4).join('/');
}

/**
 * One collection row. Readable collections offer Download; restricted ones
 * offer a metadata-only import or a token update (issue 135).
 */
function LdacaCollectionRow({
  record,
  importingId,
  onImport,
  onUpdateToken,
}: {
  record: LdacaCollection;
  importingId?: string;
  onImport: (recordId: string, metadataOnly: boolean) => void;
  onUpdateToken: () => void;
}) {
  const isImporting = importingId === record.id;
  const restricted = record.has_access === false;
  const itemCount = record.object_count ?? null;
  // Some collections publish only their own description, not their items.
  const collectionOnly = itemCount === 0;

  return (
    <div className="bg-surface text-surface-foreground rounded-md border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="space-y-1">
            <h3 className="text-body leading-5 font-semibold">
              <a
                href={ldacaRecordUrl(record)}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {record.title}
              </a>
            </h3>
            <p className="text-description text-label-secondary break-all">
              {/* crate_id may be '' on malformed records and must fall through to id */}
              {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
              {record.crate_id || record.id}
            </p>
          </div>
          {record.description ? (
            <p className="text-description line-clamp-3 text-body">{record.description}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {restricted ? (
              <Badge
                variant="secondary"
                className="gap-1 text-label-secondary"
                title={record.access_group ?? undefined}
              >
                <Lock className="size-3" aria-hidden="true" />
                Restricted
                {record.access_group ? `: ${accessGroupLabel(record.access_group)}` : ''}
              </Badge>
            ) : null}
            {itemCount !== null ? (
              <Badge variant="outline" className="text-label-secondary">
                {itemCount === 0
                  ? 'Collection description only'
                  : `${itemCount.toLocaleString()} item${itemCount === 1 ? '' : 's'}`}
              </Badge>
            ) : null}
            {record.license ? (
              <Badge variant="outline" className="max-w-full truncate text-label-secondary">
                {record.license}
              </Badge>
            ) : null}
          </div>
          {restricted ? (
            <p className="text-description text-label-secondary">
              {collectionOnly
                ? 'Your API token cannot read this collection, and it publishes no item metadata. Import the collection description, or update your token if you have been granted access.'
                : 'Your API token cannot read this collection’s texts. Import its item metadata only, or update your token if you have been granted access.'}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {restricted ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onImport(record.id, true);
                }}
                disabled={Boolean(importingId)}
              >
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {collectionOnly ? 'Import collection metadata' : 'Import metadata only'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onUpdateToken}>
                <KeyRound className="mr-2 h-4 w-4" />
                Update API token
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onImport(record.id, false);
              }}
              disabled={!record.importable || Boolean(importingId)}
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Lists every LDaCA collection, filtered locally, with access checked for the
 * current API token when the dialog opens.
 * Rendered by: DataLoaderDialogs.
 */
export function LdacaImportDialog(props: LdacaImportDialogProps) {
  const visible = filterLdacaCollections(props.collections, props.filter);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && props.importing) return;
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="flex max-h-[88vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-3xl">
        <div className="flex flex-col gap-1.5 pr-8">
          <DialogTitle>Import LDaCA collections</DialogTitle>
          <DialogDescription>
            Browse the collections on the{' '}
            <a
              href="https://data.ldaca.edu.au"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              LDaCA Data Portal
            </a>
            , then download one into your data folder as parquet.
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-col gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ldaca-collection-filter">Filter collections</Label>
            <div className="relative">
              <Search
                className="text-description pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id="ldaca-collection-filter"
                className="pl-8"
                value={props.filter}
                onChange={(event) => {
                  props.onFilterChange(event.target.value);
                }}
                placeholder="Name or description, e.g. COOEE"
              />
            </div>
          </div>

          {props.tokenPanelOpen ? (
            <div className="rounded-md border border-surface-border/70 p-3">
              <DataPortalCredentialPanel onChanged={props.onTokenChanged} />
            </div>
          ) : null}

          {props.errorMessage ? (
            <p
              role="alert"
              className="border-error/30 bg-error/10 text-error rounded-md border px-3 py-2 text-body"
            >
              {props.errorMessage}
            </p>
          ) : null}

          <section className="flex min-h-0 flex-col gap-3" aria-label="LDaCA collections">
            <div className="text-description flex items-center justify-between gap-3 text-label-secondary">
              <span>
                {visible.length} of {props.collections.length} collections
              </span>
              {props.collectionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </div>
            <div className="max-h-[min(52vh,32rem)] space-y-3 overflow-y-auto pr-1">
              {visible.map((record) => (
                <LdacaCollectionRow
                  key={record.id}
                  record={record}
                  importingId={props.importingId}
                  onImport={props.onImport}
                  onUpdateToken={() => {
                    props.onTokenPanelOpenChange(true);
                  }}
                />
              ))}
              {!props.collectionsLoading && visible.length === 0 ? (
                <p className="text-description rounded-md border border-dashed px-3 py-2 text-body">
                  {props.collections.length === 0
                    ? 'No collections are available.'
                    : 'No collections match the filter.'}
                </p>
              ) : null}
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
            }}
            disabled={props.importing}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
