import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs as ModeTabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as projectApi from '@/features/project/api';
import { suggestDataBlockName } from '@/features/project/automaticNames';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import * as objectsApi from '@/features/project/objects';
import { schemaQuery } from '@/features/project/projectQueries';
import * as tasksApi from '@/features/project/tasksApi';
import * as editingApi from '@/features/table-editing/api';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import * as annotationApi from '@/features/tools/annotation/api';
import * as analysesApi from '@/features/tools/common/analysisApi';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { analysisDraftKey } from '../common/analysisDraftStore';
import {
  decodeAnalysisRequest,
  decodeAnnotationSetup,
  useRequestReset,
} from '../common/analysisRequest';
import { NodeColumnSelector } from '../common/components/NodeColumnSelector';
import { NodeInputsPanel } from '../common/components/NodeInputsPanel';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { useNodeInputs } from '../common/nodeInputs/useNodeInputs';
import { Tabs } from '../common/Tabs';
import { useNodePreferences } from '../common/useNodePreferences';
import { useTabSettings } from '../common/useTabSettings';
import { VIZ_PALETTE } from '../common/vizPalette';
import { AnnotationAi } from './AnnotationAi';
import { AnnotationEditor } from './AnnotationEditor';
import { useAnnotationState } from './annotationState';

interface Props {
  base: string;
  nodes: projectApi.ProjectNode[];
  active: boolean;
  tasks?: tasksApi.NativeTask[];
  onCancel?: (id: string) => void;
}
export default function AnnotationFeature(props: Props) {
  const chosen = useAnnotationState((s) => s.active[props.base]);
  return (
    <Tabs
      {...props}
      kind="annotation"
      label="Annotation"
      description="Label documents with a shared Codebook."
      chosen={chosen}
      onActivate={(id) => {
        useAnnotationState.getState().activate(props.base, id);
      }}
      onRemove={(id) => {
        useAnnotationState.getState().remove(props.base, id);
      }}
    >
      {(tab) => <AnnotationTab key={tab.id} {...props} tab={tab} />}
    </Tabs>
  );
}
function AnnotationTab({
  base,
  nodes,
  active,
  tab,
  tasks = [],
  onCancel = () => {
    /* Manual-only hosts have no task cancellation action. */
  },
}: Props & { tab: analysesApi.Tab }) {
  const cache = useQueryClient();
  const savePreference = useNodePreferences(base);
  const navigate = useEditingNavigation();
  const local = useAnnotationState((s) => s.drafts[analysisDraftKey(base, tab.id)]);
  const manual = tab.settings.manual;
  const restored = decodeAnnotationSetup(
    tab.setup_status,
    manual && typeof manual === 'object' && 'setup' in manual ? manual.setup : undefined,
  );
  const aiRestored = decodeAnalysisRequest(
    'annotation',
    tab.analysis?.request_status,
    tab.analysis?.request,
  );
  const manualTime =
    manual &&
    typeof manual === 'object' &&
    'started_at' in manual &&
    typeof manual.started_at === 'string'
      ? manual.started_at
      : '';
  const latestIsAi = Boolean(tab.analysis && (!manualTime || tab.analysis.created_at > manualTime));
  const issues = latestIsAi ? aiRestored.issues : restored.issues;
  const { resetDone, acknowledge } = useRequestReset(
    [base, tab.id],
    latestIsAi ? [tab.analysis?.id, tab.analysis?.request] : [manualTime, manual],
  );
  const blocked = issues.length > 0 && !resetDone;
  const setup = local?.setup ?? (latestIsAi ? aiRestored.request.setup : restored.request);
  const update = (patch: Partial<annotationApi.AnnotationSetup>) => {
    useAnnotationState
      .getState()
      .setDraft(base, tab.id, { ...local, setup: { ...setup, ...patch } });
  };
  const { settings, change } = useTabSettings(base, tab);
  const mode = settings.mode === 'ai' ? 'ai' : 'manual';
  const [aiEditing, setAiEditing] = useState(false);
  const [session, setSession] = useState<editingApi.CellEditSession | null>(null);
  const [codebookSession, setCodebookSession] = useState<editingApi.CellEditSession | null>(null);
  const [create, setCreate] = useState<
    | { kind: 'codebook' }
    | { kind: 'annotation' | 'correction'; source: objectsApi.ObjectRef }
    | null
  >(null);
  const [name, setName] = useState('');
  const schema = useQuery({
    ...schemaQuery(base, setup.source),
    enabled: active && Boolean(setup.source.name),
  });
  const bookSchema = useQuery({
    ...schemaQuery(base, setup.codebook?.source ?? { schema: 'data', name: '' }),
    enabled: active && Boolean(setup.codebook?.source.name),
  });
  const columns = (schema.data ?? []).filter((c) => isArrowStringField(c.field)).map((c) => c.name);
  const bookColumns = (bookSchema.data ?? [])
    .filter((c) => isArrowStringField(c.field))
    .map((c) => c.name);
  const node = nodes.find((n) => n.table_name === setup.source.name);
  const bookNode = nodes.find((n) => n.table_name === setup.codebook?.source.name);
  const picker = useNodeInputs({
    value: setup.source.name ? [{ node_id: setup.source.name, column: setup.document }] : [],
    onChange: (next) => {
      update(
        next[0]
          ? {
              source: { schema: 'data', name: next[0].node_id },
              document: next[0].column ?? '',
              annotation: '',
              correction: null,
            }
          : { source: { schema: '', name: '' }, document: '', annotation: '', correction: null },
      );
    },
    allNodes: nodes.map((n) => ({
      id: n.table_name,
      name: n.table_name,
      color: n.color,
      document: n.document_column,
      tokenizerModel: null,
    })),
    getColumnInfos: () => mapArrowColumnsToInfo(schema.data ?? []),
    constraints: { maxNodes: 1, fieldPredicate: isArrowStringField, preserveColumnSelection: true },
  });
  const captured = { ...setup, document: picker.nodeColumnSelections[0]?.column ?? setup.document };
  const start = useMutation({
    mutationFn: (request: annotationApi.AnnotationEdit) =>
      annotationApi.beginAnnotationEdit(base, tab.id, request),
    onSuccess: (created, request) => {
      if (request.mode === 'codebook') setCodebookSession(created);
      else setSession(created);
      void cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'annotation'] });
    },
  });
  const materialize = useMutation({
    mutationFn: (source: objectsApi.ObjectRef) => projectApi.materializeNode(base, source),
  });
  const add = useMutation({
    mutationFn: async (target: NonNullable<typeof create>) => {
      if (target.kind === 'codebook') return annotationApi.createAnnotationCodebook(base, name);
      await projectApi.changeColumn(base, target.source, {
        operation: 'add',
        column: name,
        sql_type: 'VARCHAR',
      });
      return null;
    },
    onSuccess: (book, target) => {
      if (book) update({ codebook: book });
      else if (target.kind !== 'codebook' && objectsApi.sameTarget(target.source, setup.source))
        update({ [target.kind]: name });
      setCreate(null);
      setName('');
    },
  });
  const color =
    node?.color ?? (typeof settings.color === 'string' ? settings.color : VIZ_PALETTE[0]);
  return (
    <>
      <section
        aria-label="Annotation request"
        data-guidance-annotation-mode={mode}
        data-guidance-editing={Boolean(session) || aiEditing}
        className="flex flex-col gap-3 rounded-lg border border-surface-border p-3"
      >
        <h1 className="font-semibold">Annotation</h1>
        <ModeTabs
          value={mode}
          onValueChange={(value) => {
            navigate(() => {
              change({ mode: value });
            });
          }}
        >
          <TabsList>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>
        </ModeTabs>
        <fieldset
          data-guidance-stage="setup"
          disabled={Boolean(session) || aiEditing || start.isPending}
          className="min-w-0 flex flex-col gap-3"
        >
          <NodeInputsPanel
            {...picker}
            disabled={Boolean(session) || aiEditing || start.isPending}
            title="Annotation source"
            columnLabel="Document column"
            maxNodes={1}
            inputOrder={setup.source.name ? [setup.source.name] : []}
            onAddNodes={picker.addNodes}
            onRemoveNode={picker.removeNode}
            onClear={picker.clear}
            onColumnChange={(name, column) => {
              picker.setColumn(name, column);
              savePreference(name, { preference: 'document_column', value: column || null });
            }}
            nodeColors={{ [setup.source.name]: color ?? '' }}
            onNodeColorChange={(name, color) => {
              savePreference(name, { preference: 'color', value: color });
            }}
            unavailableNodes={
              setup.source.name && !node
                ? [{ id: setup.source.name, name: setup.source.name, column: setup.document }]
                : []
            }
          />
          <div className="flex flex-wrap items-end gap-2">
            <NodeColumnSelector
              columns={columns.filter((c) => c !== setup.document && c !== setup.correction)}
              value={setup.annotation}
              preserveValue={setup.annotation}
              label="Annotation column"
              onChange={(annotation) => {
                update({ annotation });
              }}
            />
            <Button
              variant="outline"
              disabled={node?.kind !== 'table'}
              onClick={() => {
                setName('annotation');
                setCreate({ kind: 'annotation', source: objectsApi.objectRef(setup.source) });
              }}
            >
              New annotation column
            </Button>
            <NodeColumnSelector
              columns={columns.filter((c) => c !== setup.document && c !== setup.annotation)}
              value={setup.correction ?? ''}
              preserveValue={setup.correction ?? ''}
              label="Correction column"
              clearOptionValue=""
              clearOptionLabel="None"
              onChange={(correction) => {
                update({ correction: correction || null });
              }}
            />
            <Button
              variant="outline"
              disabled={node?.kind !== 'table'}
              onClick={() => {
                setName('correction');
                setCreate({ kind: 'correction', source: objectsApi.objectRef(setup.source) });
              }}
            >
              New correction column
            </Button>
          </div>
          {node?.kind === 'view' && (
            <div className="flex flex-wrap items-center gap-2">
              <p>Annotation writes require a Table.</p>
              <Button
                variant="outline"
                disabled={materialize.isPending}
                onClick={() => {
                  materialize.mutate(objectsApi.objectRef(setup.source));
                }}
              >
                Materialize in place
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-40 flex-col gap-1">
              Codebook
              <SearchableSelect
                ariaLabel="Codebook"
                value={setup.codebook?.source.name ?? ''}
                options={nodes.map((n) => ({ value: n.table_name }))}
                pinnedOptions={[{ value: '', label: 'None' }]}
                onChange={(value) => {
                  update({
                    codebook: value
                      ? { source: { schema: 'data', name: value }, code: '', description: '' }
                      : null,
                  });
                }}
              />
            </label>
            {setup.codebook && (
              <>
                <NodeColumnSelector
                  label="Code column"
                  columns={bookColumns.filter((c) => c !== setup.codebook?.description)}
                  value={setup.codebook.code}
                  preserveValue={setup.codebook.code}
                  onChange={(code) => {
                    update({ codebook: setup.codebook ? { ...setup.codebook, code } : null });
                  }}
                />
                <NodeColumnSelector
                  label="Description column"
                  columns={bookColumns.filter((c) => c !== setup.codebook?.code)}
                  value={setup.codebook.description}
                  preserveValue={setup.codebook.description}
                  onChange={(description) => {
                    update({
                      codebook: setup.codebook ? { ...setup.codebook, description } : null,
                    });
                  }}
                />
              </>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setName(
                  suggestDataBlockName(
                    [setup.source.name],
                    'cb',
                    nodes.map((node) => node.table_name),
                  ),
                );
                setCreate({ kind: 'codebook' });
              }}
            >
              Create Codebook
            </Button>
          </div>
        </fieldset>
        {setup.codebook && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={
                start.isPending ||
                !setup.codebook.code ||
                !setup.codebook.description ||
                bookNode?.kind !== 'table'
              }
              onClick={() => {
                if (setup.codebook) start.mutate({ mode: 'codebook', codebook: setup.codebook });
              }}
            >
              Edit Codebook
            </Button>
            {bookNode?.kind === 'view' && (
              <Button
                variant="outline"
                disabled={materialize.isPending}
                onClick={() => {
                  if (setup.codebook)
                    materialize.mutate(objectsApi.objectRef(setup.codebook.source));
                }}
              >
                Materialize Codebook in place
              </Button>
            )}
          </div>
        )}
        {mode === 'manual' && (
          <>
            <RequestCompatibilityWarning
              issues={issues}
              onReset={() => {
                useAnnotationState
                  .getState()
                  .setDraft(base, tab.id, { setup: decodeAnnotationSetup().request });
                acknowledge();
              }}
              resetDone={!blocked}
              action="Start"
            />
            <div className="flex gap-2">
              {session ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    navigate(() => {
                      /* The editor guard closes its own session. */
                    }, session.session_id);
                  }}
                >
                  Close
                </Button>
              ) : (
                <Button
                  data-guidance-stage="action"
                  disabled={
                    blocked ||
                    start.isPending ||
                    !captured.document ||
                    !setup.annotation ||
                    node?.kind !== 'table'
                  }
                  onClick={() => {
                    update(captured);
                    start.mutate({ mode: 'manual', setup: captured });
                  }}
                >
                  {start.isPending ? 'Starting…' : 'Start'}
                </Button>
              )}
            </div>
          </>
        )}
      </section>
      {mode === 'ai' && (
        <AnnotationAi
          base={base}
          tab={tab}
          nodes={nodes}
          tasks={tasks}
          onCancel={onCancel}
          active={active}
          onEditingChange={setAiEditing}
          request={{ ...aiRestored.request, ...local?.execution, setup: captured }}
          onChange={(request) => {
            const { setup: next, ...execution } = request;
            useAnnotationState.getState().setDraft(base, tab.id, { setup: next, execution });
          }}
        />
      )}
      {session && (
        <AnnotationEditor
          key={session.session_id}
          base={base}
          session={session}
          setup={setup}
          onFinished={() => {
            setSession(null);
          }}
        />
      )}
      {codebookSession && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open)
              navigate(() => {
                /* The editor guard closes its own session. */
              }, codebookSession.session_id);
          }}
        >
          <DialogContent
            className="flex h-[85vh] max-w-[90vw] flex-col"
            onInteractOutside={(event) => {
              event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit Codebook</DialogTitle>
              <DialogDescription>
                Save codes and descriptions together. Other columns remain unchanged.
              </DialogDescription>
            </DialogHeader>
            <AnnotationEditor
              key={codebookSession.session_id}
              base={base}
              session={codebookSession}
              onFinished={() => {
                setCodebookSession(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {create && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !add.isPending) setCreate(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {create.kind === 'codebook' ? 'Create Codebook' : 'Create label column'}
              </DialogTitle>
              <DialogDescription>
                {create.kind === 'codebook'
                  ? 'Create an empty Table with code and description columns.'
                  : `Add a string column to ${create.source.name}.`}
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim() && !add.isPending) add.mutate(create);
              }}
            >
              <Input
                aria-label="Name"
                value={name}
                disabled={add.isPending}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={add.isPending}
                  onClick={() => {
                    setCreate(null);
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={!name.trim() || add.isPending}>
                  {add.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
