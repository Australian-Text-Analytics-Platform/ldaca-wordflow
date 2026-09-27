import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as api from '@/features/project/api';
import {
  DATA_BLOCK_EXPORT_FORMATS,
  type DataBlockExportFormat,
} from '@/features/project/common/exportFormats';
import { NodeInputsPanel } from '@/features/tools/common/components/NodeInputsPanel';
import { useNodeInputRequestsStore } from '@/stores/nodeInputRequestsStore';

const actions = {
  copy_table: 'Keep Table definition',
  write_file: 'Write data file',
  preserve_view: 'Keep View',
  materialize_view: 'Save View as a Table',
};

/** Export choices last for this window visit; tasks own captured requests and staging files. */
export default function ExportFeature({
  base,
  nodes,
  graphSelection,
  active,
}: {
  base: string;
  nodes: api.ProjectNode[];
  graphSelection: api.ObjectRef[];
  active: boolean;
}) {
  const [mode, setMode] = useState('files');
  const [scope, setScope] = useState('selected');
  const [format, setFormat] = useState<DataBlockExportFormat>('csv');
  const [selected, setSelected] = useState<api.ObjectRef[]>([]);
  const [includeHidden, setIncludeHidden] = useState(false);
  const catalogue = useQuery({
    queryKey: ['native', base, 'graph', 'dependencies'],
    queryFn: ({ signal }) => api.dependencyGraph(base, signal),
    enabled: active && (includeHidden || selected.some((r) => r.schema !== 'data')),
  });
  const candidates = includeHidden
    ? (catalogue.data?.nodes ?? [])
        .filter((node) => node.kind !== 'missing')
        .map((node) => ({ ref: node.object, color: node.color }))
    : nodes
        .filter((node) => node.visible && node.kind !== 'missing')
        .map((node) => ({ ref: api.objectRef(node.table_name), color: node.color }));
  const metadata = (ref: api.ObjectRef) => ({
    id: api.targetKey(ref),
    name: ref.schema === 'data' ? ref.name : api.targetLabel(ref),
    color: nodes.find((node) => api.sameTarget(node.table_name, ref))?.color ?? null,
    document: null,
    tokenizerModel: null,
  });
  const selectedKeys = new Set(selected.map(api.targetKey));
  const add = (refs: api.ObjectRef[]) => {
    setSelected((previous) => {
      const seen = new Set(previous.map(api.targetKey));
      return [
        ...previous,
        ...refs.filter((ref) => {
          const key = api.targetKey(ref);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      ];
    });
  };
  const carried = useNodeInputRequestsStore((s) =>
    s.pendingRequests.findLast((r) => r.scopeId === base && r.tool === 'export'),
  );
  const consume = useNodeInputRequestsStore((s) => s.consume);
  const complete = mode === 'project' && scope === 'complete';
  const request: api.ExportRequest =
    mode === 'files'
      ? { kind: 'files', objects: selected, format }
      : complete
        ? { kind: 'complete_project' }
        : { kind: 'selected_project', objects: selected };
  const inspection = useQuery({
    queryKey: ['native', base, 'graph', 'export-inspection', request],
    queryFn: ({ signal }) => api.inspectExport(base, request, signal),
    enabled: active && mode === 'project' && (complete || selected.length > 0),
  });
  const download = useMutation({
    mutationFn: (captured: api.ExportRequest) => api.exportProject(base, captured),
    onSuccess: (filename) => {
      if (filename !== null) toast.success('Export saved', { description: filename });
    },
  });
  return (
    <div className="space-y-3 p-3" data-testid="export-feature">
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList aria-label="Export mode">
          <TabsTrigger value="files">Data files</TabsTrigger>
          <TabsTrigger value="project">Wordflow project</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'project' && (
            <div className="space-y-2">
              <label className="text-body font-medium" htmlFor="export-scope">
                Project scope
              </label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="export-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selected">Selected Data Blocks</SelectItem>
                  <SelectItem value="complete">Complete project</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-body text-description">
                {complete
                  ? 'Copy all committed data, saved analyses and project settings into an independent project.'
                  : 'Create a fresh project with the selected Data Blocks and their metadata. Analyses and SQL cells are excluded.'}
              </p>
            </div>
          )}
          {!complete && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-body">
                  <Checkbox
                    checked={includeHidden}
                    onCheckedChange={(value) => {
                      setIncludeHidden(value === true);
                    }}
                  />
                  Include hidden and other schema objects
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={graphSelection.length === 0}
                  onClick={() => {
                    add(graphSelection);
                  }}
                >
                  Use graph selection
                </Button>
              </div>
              {includeHidden && catalogue.isFetching && (
                <p role="status" className="text-body text-description">
                  Loading Data Blocks…
                </p>
              )}
              <NodeInputsPanel
                title="Data Blocks to export"
                resolvedNodes={selected.map((ref) => ({
                  id: api.targetKey(ref),
                  name: ref.name,
                  node: metadata(ref),
                  column: '',
                  columnOptions: [],
                }))}
                availableNodes={candidates
                  .filter(({ ref }) => !selectedKeys.has(api.targetKey(ref)))
                  .map(({ ref }) => metadata(ref))}
                canAddMore
                showAddAll
                showColumnPicker={false}
                maxVisibleCards={3}
                onAddNodes={(ids) => {
                  add(
                    ids.flatMap((id) => {
                      const found = candidates.find(({ ref }) => api.targetKey(ref) === id);
                      return found
                        ? [found.ref]
                        : carried && api.targetKey(carried.nodeId) === id
                          ? [api.objectRef(carried.nodeId)]
                          : [];
                    }),
                  );
                  return [];
                }}
                onRemoveNode={(id) => {
                  setSelected((previous) => previous.filter((ref) => api.targetKey(ref) !== id));
                }}
                onClear={() => {
                  setSelected([]);
                }}
                onColumnChange={() => {
                  /* Export always includes every column. */
                }}
                pendingInputRequest={
                  carried ? { id: carried.id, nodeId: api.targetKey(carried.nodeId) } : undefined
                }
                consumeInputRequest={consume}
              />
            </>
          )}
          {mode === 'files' ? (
            <>
              <div className="space-y-2">
                <label htmlFor="export-format" className="text-body font-medium">
                  Format
                </label>
                <Select
                  value={format}
                  onValueChange={(value) => {
                    const next = DATA_BLOCK_EXPORT_FORMATS.find((f) => f.value === value);
                    if (next) setFormat(next.value);
                  }}
                >
                  <SelectTrigger id="export-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_BLOCK_EXPORT_FORMATS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-body text-description">
                {selected.length > 1
                  ? 'Each Data Block becomes a separate file in one ZIP.'
                  : 'One Data Block downloads as one file.'}{' '}
                All committed rows and columns are included. Data View filters and unsaved edits are
                not applied.
              </p>
            </>
          ) : (
            <>
              <p className="text-body text-description">
                Self-contained Views stay as Views. Views with external or excluded dependencies are
                saved as Tables. The original project stays open and unchanged.
              </p>
              {(complete || selected.length > 0) && (
                <div aria-label="Export inspection" className="rounded-md border p-3 text-body">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Project contents</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={inspection.isFetching}
                      onClick={() => void inspection.refetch()}
                    >
                      Refresh
                    </Button>
                  </div>
                  {inspection.isFetching ? (
                    <p role="status">Inspecting definitions…</p>
                  ) : inspection.isError ? (
                    <p>Could not inspect this selection. Use Refresh to retry.</p>
                  ) : (
                    <>
                      <p className="text-description">
                        {inspection.data?.summary.data_blocks ?? 0} Data Blocks ·{' '}
                        {inspection.data?.summary.hidden_data_blocks ?? 0} hidden Data Blocks ·{' '}
                        {inspection.data?.summary.analyses ?? 0} saved analyses ·{' '}
                        {inspection.data?.summary.sql_cells ?? 0} SQL cells. Definitions are checked
                        again when exporting.
                      </p>
                      <ul className="mt-2 max-h-56 space-y-2 overflow-auto">
                        {inspection.data?.objects
                          .filter(
                            (item) =>
                              !complete ||
                              item.classification === 'data_block' ||
                              item.action === 'materialize_view' ||
                              item.reason,
                          )
                          .map((item) => (
                            <li key={api.targetKey(item.source)} className="break-words">
                              <span className="font-medium">{api.targetLabel(item.source)}</span> —{' '}
                              {actions[item.action]}
                              {item.reason && <p className="text-description">{item.reason}</p>}
                            </li>
                          ))}
                      </ul>
                      {complete && (
                        <details className="mt-2">
                          <summary className="cursor-pointer">
                            Internal storage and hidden Data Blocks
                          </summary>
                          <ul className="max-h-56 overflow-auto">
                            {inspection.data?.objects
                              .filter((item) => item.classification !== 'data_block')
                              .map((item) => (
                                <li key={api.targetKey(item.source)} className="break-words">
                                  {api.targetLabel(item.source)} — {actions[item.action]}
                                </li>
                              ))}
                          </ul>
                        </details>
                      )}
                      {inspection.data?.blockers.map((error, i) => (
                        <p key={i} role="alert" className="mt-2 text-error">
                          {error.message}
                        </p>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                download.isPending ||
                (!complete && selected.length === 0) ||
                (mode === 'project' &&
                  (inspection.isFetching ||
                    !inspection.data ||
                    inspection.isError ||
                    inspection.data.blockers.length > 0))
              }
              onClick={() => {
                download.mutate(request);
              }}
            >
              {download.isPending ? 'Exporting…' : 'Export'}
            </Button>
            {download.isPending && (
              <p role="status" className="text-body text-description">
                You can continue working. View progress or cancel in Task Centre.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
