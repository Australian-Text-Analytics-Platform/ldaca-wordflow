import { schemaQuery } from '@/features/project/projectQueries';
import { lazy, Suspense, useState } from 'react';
import { useQueries, useMutation, useIsMutating } from '@tanstack/react-query';
import { Calculator, Code2, Filter, Layers, Merge, Search, Shuffle } from 'lucide-react';
import InfoIcon from '@/components/help/InfoIcon';
import { EditorTabs } from '@/components/tabs';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { NodeInputsPanel } from '@/features/tools/common/components/NodeInputsPanel';
import {
  useNodeInputs,
  type UseNodeInputsResult,
} from '@/features/tools/common/nodeInputs/useNodeInputs';
import { useNodeInputRequests } from '@/features/tools/common/nodeInputs/useNodeInputRequests';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { reportProjectError } from '@/features/project/projectErrors';
import type { ProjectNode } from '@/features/project/api';
import { querySql } from '@/features/project/api';
import { usePreprocessingInputs } from './inputState';
import { FilterSubTab } from './filter/FilterSubTab';
import { SliceSubTab } from './slice/SliceSubTab';
import { JoinSubTab } from './join/JoinSubTab';
import { joinColumnMappings } from './join/columnMappings';
import { ConcatSubTab } from './concat/ConcatSubTab';
import { ReplaceSubTab } from './replace/ReplaceSubTab';
import { BuildSubTab } from './build/BuildSubTab';
const SqlSubTab = lazy(() =>
  import('./sql/SqlSubTab').then((module) => ({ default: module.SqlSubTab })),
);
import type { FilterRequest } from './types';
import type { ReplaceRequest } from './replace/hooks/replaceRequestModel';
import { buildExpression, type BuildColumnRequest } from './build/hooks/buildExpressionModel';
import {
  applyTransformation,
  applyFind,
  previewSql,
  resultSelect,
  type Transformation,
  type ColumnMapping,
} from './projectPreprocessing';
import {
  bindInput,
  columnSelect,
  filterSelect,
  findColumn,
  joinSelect,
  sampleSelect,
  stackSelect,
  resolveColumnName,
} from './sql';

const TOOLS = [
  { id: 'filter', title: 'Filter', Icon: Filter },
  { id: 'slice', title: 'Sample', Icon: Shuffle },
  { id: 'join', title: 'Join', Icon: Merge },
  { id: 'concat', title: 'Stack', Icon: Layers },
  { id: 'find', title: 'Find', Icon: Search },
  { id: 'build', title: 'Build', Icon: Calculator },
  { id: 'sql', title: 'SQL', Icon: Code2 },
] as const;
type Tool = (typeof TOOLS)[number]['id'];
const EMPTY_INPUTS: [] = [];

export interface DataPreprocessingProps {
  base: string;
  nodes: ProjectNode[];
  active: boolean;
  editing?: boolean;
}

/** Retained forms, with project-owned inputs and DuckDB execution. No server providers mount here. */
export default function DataPreprocessingFeature(props: DataPreprocessingProps) {
  const tool = usePreprocessingInputs((state) => state.activeTool) as Tool;
  const activate = usePreprocessingInputs((state) => state.activate);
  const [visited, setVisited] = useState<Tool[]>([tool]);
  const setTool = (value: string) => {
    const next = TOOLS.find(({ id }) => id === value)?.id;
    if (next) {
      activate(next);
      setVisited((current) => (current.includes(next) ? current : [...current, next]));
    }
  };
  return (
    <div className="@container/preprocessing w-full min-w-0 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-heading-1 font-semibold">Data Preprocessing</h1>
        <InfoIcon targetKey="preprocessing.overview" label="About Data Preprocessing" />
      </div>
      {tool !== 'sql' && (
        <p className="text-body text-description">
          {tool === 'find'
            ? 'Find adds or replaces a column in the selected Data Block.'
            : 'This tool creates a new View that follows its inputs. Input Data Blocks stay unchanged.'}
        </p>
      )}
      <Tabs
        value={tool}
        onValueChange={(value) => {
          setTool(value);
        }}
      >
        <EditorTabs
          aria-label="Data preprocessing tools"
          activeTabId={tool}
          onActivate={(value) => {
            setTool(value);
          }}
          tabs={TOOLS.map(({ id, title, Icon }) => ({
            id,
            title,
            icon: <Icon className="size-4" />,
            tabDomId: `preprocessing-tab-${id}`,
            panelDomId: `preprocessing-panel-${id}`,
          }))}
        />
        {TOOLS.map(({ id }) => (
          <TabsContent
            key={id}
            forceMount
            value={id}
            id={`preprocessing-panel-${id}`}
            aria-labelledby={`preprocessing-tab-${id}`}
            hidden={id !== tool}
            className="pt-4 data-[state=inactive]:hidden"
          >
            {visited.includes(id) && (
              <Suspense fallback={<p>Loading preprocessing…</p>}>
                {id === 'sql' ? (
                  <SqlSubTab
                    base={props.base}
                    active={props.active && id === tool}
                    editing={props.editing ?? false}
                  />
                ) : (
                  <ToolPane {...props} tool={id} active={props.active && id === tool} />
                )}
              </Suspense>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ToolPane({
  base,
  nodes,
  active,
  tool,
}: DataPreprocessingProps & { tool: Exclude<Tool, 'sql'> }) {
  const storedInputs = usePreprocessingInputs((state) => state.byTool[tool] ?? EMPTY_INPUTS);
  const join = usePreprocessingInputs((state) => state.join);
  const setJoin = usePreprocessingInputs((state) => state.setJoin);
  const inputs =
    tool === 'join' ? [join.left, join.right].filter((input) => input !== null) : storedInputs;
  const schemaNames = [...new Set(inputs.map((input) => input.node_id))];
  const setInputs = usePreprocessingInputs((state) => state.set);
  const [name, setName] = useState('');
  const mutationKey = ['native', base, 'preprocessing-apply', tool];
  const pending = useIsMutating({ mutationKey });
  const projectNodes: NodeMetadata[] = nodes.map((node) => ({
    id: node.table_name,
    name: node.table_name,
    color: node.color,
    document: node.document_column,

    tokenizerModel: null,
  }));
  const schemas = useQueries({
    queries: schemaNames.map((node_id) => ({
      ...schemaQuery(base, node_id, true),
      enabled: active,
    })),
  });
  const columns = (node: Pick<NodeMetadata, 'id'>) =>
    mapArrowColumnsToInfo(schemas[schemaNames.indexOf(node.id)]?.data ?? []);
  const maxNodes = tool === 'join' ? 2 : tool === 'concat' ? 6 : 1;
  const picker = useNodeInputs({
    value: inputs,
    onChange: (next) => {
      setInputs(tool, next);
    },
    allNodes: projectNodes,
    getColumnInfos: columns,
    constraints: { maxNodes, ...(tool === 'find' ? { fieldPredicate: isArrowStringField } : {}) },
  });
  const leftPicker = useNodeInputs({
    value: join.left ? [join.left] : EMPTY_INPUTS,
    onChange: (next) => {
      setJoin('left', next[0] ?? null);
    },
    allNodes: projectNodes,
    getColumnInfos: columns,
    constraints: { maxNodes: 1 },
  });
  const rightPicker = useNodeInputs({
    value: join.right ? [join.right] : EMPTY_INPUTS,
    onChange: (next) => {
      setJoin('right', next[0] ?? null);
    },
    allNodes: projectNodes,
    getColumnInfos: columns,
    constraints: { maxNodes: 1 },
  });
  const first = picker.selectedNodes[0] ?? null;
  const inputRequests = useNodeInputRequests({
    scopeId: base,
    tool,
    enabled: active && tool !== 'join',
    addNodes: picker.addNodes,
  });
  const id = first?.id ?? null;
  const selected = picker.selectedNodes.map((node) => node.id);
  const isLoading = { operations: pending > 0 };
  const onAlert = (message: string) => {
    reportProjectError(new Error(message), 'Preprocessing failed', `preprocessing-${tool}`);
  };
  const inputPanel = () =>
    tool === 'join' ? (
      <div className="flex flex-col gap-3">
        <JoinInputPanel base={base} active={active} role="Left" picker={leftPicker} />
        <JoinInputPanel base={base} active={active} role="Right" picker={rightPicker} />
      </div>
    ) : (
      <NodeInputsPanel
        {...inputRequests}
        resolvedNodes={picker.resolvedNodes}
        availableNodes={picker.availableNodes}
        canAddMore={picker.canAddMore}
        maxNodes={maxNodes}
        onAddNodes={picker.addNodes}
        onRemoveNode={picker.removeNode}
        onClear={picker.clear}
        onColumnChange={picker.setColumn}
        showColumnPicker={tool === 'find'}
        columnLabel="Text column:"
        title="Preprocessing Inputs"
      />
    );
  const baseProps = {
    projectBase: base,
    isLoading,
    onAlert,
    renderNodeInputsPanel: inputPanel,
    previewEnabled: active,
  };
  const outputNameInput = (
    <Input
      aria-label="New Data Block name"
      placeholder={id ? `${id}_${tool}` : 'result'}
      value={name}
      onChange={(event) => {
        setName(event.target.value);
      }}
      className="min-w-32 flex-1"
    />
  );
  const unchanged = (source: string, exclude?: string): ColumnMapping[] =>
    columns(
      projectNodes.find((node) => node.id === source) ?? {
        id: source,
        name: source,
        color: null,
        document: null,
        tokenizerModel: null,
      },
    )
      .filter((column) => column.name !== exclude)
      .map((column) => ({ source, column: column.name, output: column.name }));
  const single = (source: string, select: string, exclude?: string): Transformation => ({
    select,
    currentInput: source,
    mappings: unchanged(source),
    computedColumns: exclude ? [exclude] : [],
  });
  const filter = (source: string, request: FilterRequest): Transformation =>
    single(source, filterSelect(request));
  const find = (source: string, request: ReplaceRequest): Transformation => {
    const { column, select } = findColumn(
      request,
      columns({ id: source }).map(({ name }) => name),
    );
    return single(source, select, column);
  };
  const build = (source: string, request: BuildColumnRequest): Transformation => {
    const column = resolveColumnName(
      request.column,
      unchanged(source).map((mapping) => mapping.column),
    );
    return single(
      source,
      columnSelect(
        column,
        buildExpression(request.definition, columns({ id: source })),
        unchanged(source).map((mapping) => mapping.column),
      ),
      column,
    );
  };
  const { mutateAsync: submitFind } = useMutation({
    mutationKey,
    meta: { reportError: false },
    mutationFn: ({
      target,
      request,
      columnNames,
    }: {
      target: Pick<ProjectNode, 'table_name' | 'kind'>;
      request: ReplaceRequest;
      columnNames: string[];
    }) => applyFind(base, target, request, columnNames),
  });
  const { mutateAsync: submit } = useMutation({
    mutationKey,
    meta: { reportError: false },
    mutationFn: async ({
      operation,
      outputName,
    }: {
      operation: Transformation | (() => Promise<Transformation>);
      outputName: string;
    }) =>
      applyTransformation(
        base,
        typeof operation === 'function' ? await operation() : operation,
        outputName,
      ),
  });
  function apply(
    operation: Transformation | (() => Promise<Transformation>),
    requestedName?: string,
  ) {
    const outputName =
      [requestedName?.trim(), name.trim()].find(Boolean) ?? `${id ?? 'result'}_${tool}`;
    return submit({ operation, outputName });
  }
  if (tool === 'filter')
    return (
      <FilterSubTab
        {...baseProps}
        selectedNodeId={id}
        selectedNode={first}
        columnOptions={first ? columns(first) : []}
        filterNode={(source, request) => apply(filter(source, request), request.name)}
        filterPreview={({ nodeId, payload, page, pageSize, signal }) =>
          previewSql(base, resultSelect(filter(nodeId, payload)), page, pageSize, signal)
        }
      />
    );
  if (tool === 'slice')
    return (
      <SliceSubTab
        {...baseProps}
        selectedNodeId={id}
        selectedNode={first}
        sliceNode={(source, request) => apply(single(source, sampleSelect(request)), request.name)}
        slicePreview={({ nodeId, payload, page, pageSize, signal }) =>
          previewSql(base, bindInput(sampleSelect(payload), nodeId), page, pageSize, signal)
        }
      />
    );
  if (tool === 'join')
    return (
      <JoinSubTab
        {...baseProps}
        left={
          leftPicker.resolvedNodes[0]
            ? {
                node_id: leftPicker.resolvedNodes[0].id,
                column: leftPicker.resolvedNodes[0].column,
              }
            : null
        }
        right={
          rightPicker.resolvedNodes[0]
            ? {
                node_id: rightPicker.resolvedNodes[0].id,
                column: rightPicker.resolvedNodes[0].column,
              }
            : null
        }
        joinNodes={(left, right, joinKind, leftKeys, rightKeys, newName) => {
          const select = joinSelect(left, right, joinKind, leftKeys[0], rightKeys[0]);
          const leftColumns = unchanged(left);
          const rightColumns = unchanged(right);
          return apply(async () => {
            const result = await querySql(base, [{ sql: `DESCRIBE SELECT * FROM (${select})` }]);
            return {
              select,
              mappings: joinColumnMappings(
                leftColumns,
                rightColumns,
                joinKind,
                leftKeys[0],
                rightKeys[0],
                Array.from(result, (row: Record<string, unknown>) => String(row.column_name)),
              ),
            };
          }, newName);
        }}
      />
    );
  if (tool === 'concat')
    return (
      <ConcatSubTab
        {...baseProps}
        selectedNodeIds={selected}
        projectNodes={projectNodes}
        getColumnInfos={columns}
        concatPreview={({ nodeIds, deduplicate, page, pageSize, signal }) =>
          previewSql(base, stackSelect(nodeIds, deduplicate), page, pageSize, signal)
        }
        concatNodes={(names, newName, deduplicate = false) =>
          apply(
            {
              select: stackSelect(names, deduplicate),
              mappings: names.flatMap((source) => unchanged(source)),
            },
            newName,
          )
        }
      />
    );
  if (tool === 'find')
    return (
      <ReplaceSubTab
        {...baseProps}
        selectedColumn={picker.resolvedNodes[0]?.column ?? ''}
        selectedNodes={picker.selectedNodes}
        getColumnInfos={columns}
        sourceKind={nodes.find((node) => node.table_name === id)?.kind}
        replaceText={(source, request) =>
          submitFind({
            target: {
              table_name: source,
              kind: nodes.find((node) => node.table_name === source)?.kind ?? 'missing',
            },
            request,
            columnNames: columns({ id: source }).map(({ name }) => name),
          })
        }
        replaceTextPreview={({ nodeId, payload, page, pageSize, signal }) =>
          previewSql(base, resultSelect(find(nodeId, payload)), page, pageSize, signal)
        }
      />
    );
  return (
    <BuildSubTab
      {...baseProps}
      selectedNodes={picker.selectedNodes}
      getColumnInfos={columns}
      outputNameInput={outputNameInput}
      buildColumnApply={(source, request) => apply(build(source, request))}
      buildColumnPreview={({ nodeId, payload, page, pageSize, signal }) =>
        previewSql(base, resultSelect(build(nodeId, payload)), page, pageSize, signal)
      }
    />
  );
}

/** Two placement areas keep graph additions carried until a role is chosen. */
function JoinInputPanel({
  base,
  active,
  role,
  picker,
}: {
  base: string;
  active: boolean;
  role: 'Left' | 'Right';
  picker: UseNodeInputsResult;
}) {
  const requests = useNodeInputRequests({
    scopeId: base,
    tool: 'join',
    enabled: active,
    deferPlacement: true,
    addNodes: picker.addNodes,
  });
  return (
    <NodeInputsPanel
      {...requests}
      title={`${role} input`}
      resolvedNodes={picker.resolvedNodes}
      availableNodes={picker.availableNodes}
      canAddMore={picker.canAddMore}
      maxNodes={1}
      onAddNodes={picker.addNodes}
      onRemoveNode={picker.removeNode}
      onClear={picker.clear}
      onColumnChange={picker.setColumn}
      columnLabel={`${role} column:`}
    />
  );
}
