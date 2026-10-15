import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ObjectRef } from '@/features/project/objects';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  DATA_BLOCK_TRANSFER,
  useInputDestination,
  useInputDestinations,
} from '../inputDestinations';
import type { NodeAddRejection, ResolvedNodeInput } from '../nodeInputs/nodeInputsCore';
import { VIZ_PALETTE } from '../vizPalette';
import { NodeColorPicker } from './NodeColorPicker';
import { NodeColumnSelector } from './NodeColumnSelector';
import {
  NodeSelectionList,
  type NodeSelectionItem,
  type NodeSelectionRenderArgs,
  type UnavailableNodeSelection,
} from './NodeSelectionList';

const CLEAR_COLUMN_VALUE = '__ldaca__clear__';

/** Args passed to a feature-provided per-node column addon (e.g. tokenizer model picker). */
interface NodeInputColumnAddonArgs extends NodeSelectionRenderArgs {
  column: string;
  columns: string[];
}

export interface NodeInputsPanelProps {
  identifyInput?: (target: ObjectRef) => string;
  /** Resolved (live, stale-dropped) inputs from useNodeInputs. */
  resolvedNodes: ResolvedNodeInput[];
  /** Saved inputs whose Data Blocks no longer exist in the live Project. */
  unavailableNodes?: UnavailableNodeSelection[];
  /** Full saved input order when live and unavailable cards must remain interleaved. */
  inputOrder?: string[];
  /** Live project nodes not yet added — the Add dropdown's candidate list. */
  availableNodes: NodeMetadata[];
  /** Whether another node may be added (max-nodes gate). */
  canAddMore: boolean;
  /** Offer Add all within the searchable picker, respecting its current search. */
  showAddAll?: boolean;
  /** Exact max supplied by the active feature; the shared panel never invents a generic cap. */
  maxNodes?: number;
  /** Number of cards shown before the selected list scrolls horizontally. */
  maxVisibleCards?: number;
  /** Append nodes by id; returns rejections so the panel can surface reasons. */
  onAddNodes: (ids: string[]) => NodeAddRejection[];
  /** Remove one node. */
  onRemoveNode: (id: string) => void;
  /** Clear all inputs. */
  onClear: () => void;
  /** Change a node's chosen column. */
  onColumnChange: (nodeId: string, column: string) => void;
  /** Palette used to assign fallback colours by position when a node lacks Node.color. */
  defaultPalette?: string[];
  /** Effective per-node colours for analyses that colour results by selected source node. */
  nodeColors?: Record<string, string>;
  /** Optional persisted colour change handler rendered inside selected-node cards. */
  onNodeColorChange?: (nodeId: string, color: string) => void;
  showColumnPicker?: boolean;
  columnLabel?: ReactNode | ((args: NodeSelectionRenderArgs) => ReactNode);
  title?: string;
  /** Optional compact header anchor for Contextual Hints. */
  guidanceTarget?: string;
  emptyMessage?: React.ReactNode;
  renderExtraNodeContent?: (args: NodeInputColumnAddonArgs) => React.ReactNode;
  /** Disable all mutation controls (e.g. while a run is in flight). */
  disabled?: boolean;
  /** Optional control rendered after each node's column picker (e.g. tokenizer model). */
  renderColumnAddon?: (args: NodeInputColumnAddonArgs) => React.ReactNode;
}

/**
 * Node-input selection panel for the add-node-as-needed model.
 *
 * Owns the searchable Add control, per-node remove (x), and Clear all,
 * on top of the existing column picker rendered via NodeSelectionList.
 *
 * Used by: every analysis *Feature and preprocessing subtab through their
 * ``useNodeInputs`` result, so each tool shares one curate-your-inputs surface
 * while persistence (tab inputs / preprocessing store / local state) differs.
 *
 * Flow: surface add affordances bound to ``onAddNodes`` (reporting rejections
 * via toast), then render each resolved node as a removable card with its
 * column picker fed by the node's resolved ``columnOptions``; when a feature's
 * type filter leaves no options, the node stays selected and the picker renders
 * empty. Graph/sidebar additions select among the active input destinations.
 */
export function NodeInputsPanel({
  resolvedNodes,
  identifyInput = (target) => target.name,
  unavailableNodes = [],
  inputOrder,
  availableNodes,
  canAddMore,
  showAddAll = false,
  maxNodes,
  maxVisibleCards,
  onAddNodes,
  onRemoveNode,
  onClear,
  onColumnChange,
  defaultPalette = VIZ_PALETTE,
  nodeColors,
  onNodeColorChange,
  showColumnPicker = true,
  columnLabel = 'Column',
  title = 'Selected Data Blocks',
  guidanceTarget,
  emptyMessage,
  renderExtraNodeContent,
  disabled = false,
  renderColumnAddon,
}: NodeInputsPanelProps) {
  const nodeIds = resolvedNodes.map((r) => r.id);
  const selectionItemById = new Map<string, NodeSelectionItem>([
    ...resolvedNodes.map((resolved): [string, NodeSelectionItem] => [
      resolved.id,
      { kind: 'available', id: resolved.id, node: resolved.node },
    ]),
    ...unavailableNodes.map((selection): [string, NodeSelectionItem] => [
      selection.id,
      { kind: 'unavailable', id: selection.id, selection },
    ]),
  ]);
  const selectionItems = (inputOrder ?? [...nodeIds, ...unavailableNodes.map((node) => node.id)])
    .map((nodeId) => selectionItemById.get(nodeId))
    .filter((item): item is NodeSelectionItem => item !== undefined);
  const columnByNode = new Map(resolvedNodes.map((r) => [r.id, r]));
  const [blockSearch, setBlockSearch] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);

  /** Adds ids and reports any rejection reasons as a single toast. */
  const handleAdd = (ids: string[]) => {
    if (!ids.length) return false;
    const rejections = onAddNodes(ids);
    if (rejections.length === 1) {
      toast.warning(`Couldn't add node: ${rejections[0]!.reason}`);
    } else if (rejections.length > 1) {
      toast.warning(`Couldn't add ${String(rejections.length)} nodes (already added or full).`);
    }
    return rejections.length === 0;
  };

  /** Available nodes filtered by the search box (case-insensitive name match). */
  const normalizedBlockSearch = blockSearch.trim().toLowerCase();
  const filteredAvailableNodes = normalizedBlockSearch
    ? availableNodes.filter((node) => node.name.toLowerCase().includes(normalizedBlockSearch))
    : availableNodes;

  /** Renders the per-node column picker body inside each card. */
  const renderColumnBody = (args: NodeSelectionRenderArgs) => {
    if (!showColumnPicker) return null;
    const { nodeId } = args;
    const resolved = columnByNode.get(nodeId);
    const columns = (resolved?.columnOptions ?? []).map((c) => c.name);
    const value = resolved?.column.length ? resolved.column : CLEAR_COLUMN_VALUE;
    const label = typeof columnLabel === 'function' ? columnLabel(args) : columnLabel;
    const selector = (
      <NodeColumnSelector
        key="column"
        columns={columns}
        value={value}
        preserveValue={resolved?.column}
        clearOptionValue={CLEAR_COLUMN_VALUE}
        label={label}
        disabled={disabled}
        noColumnsMessage="No columns available"
        onChange={(next) => {
          onColumnChange(nodeId, next === CLEAR_COLUMN_VALUE ? '' : next);
        }}
      />
    );
    const addon = renderColumnAddon?.({ ...args, column: resolved?.column ?? '', columns });
    return (
      <>
        {selector}
        {addon && (
          <div className="contents" data-testid="node-inputs-column-addon">
            {addon}
          </div>
        )}
      </>
    );
  };

  /** Renders optional per-node content with the same resolved column context as column add-ons. */
  const renderExtraNodeBody = renderExtraNodeContent
    ? (args: NodeSelectionRenderArgs) => {
        const resolved = columnByNode.get(args.nodeId);
        const columns = (resolved?.columnOptions ?? []).map((c) => c.name);
        return renderExtraNodeContent({
          ...args,
          column: resolved?.column ?? '',
          columns,
        });
      }
    : undefined;

  const count = selectionItems.length;
  const countLabel = maxNodes != null ? `${String(count)}/${String(maxNodes)}` : String(count);
  const destination = useInputDestination(
    title,
    (targets) => onAddNodes(targets.map(identifyInput)),
    disabled,
  );
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className="@container/node-inputs relative flex flex-col gap-2 data-[input-drag-over=true]:outline data-[input-drag-over=true]:outline-2 data-[input-drag-over=true]:outline-focus"
      data-input-destination={destination}
      data-input-drag-over={dragOver && !disabled}
      onDragOver={(event) => {
        if (
          !disabled &&
          event.dataTransfer.types.includes(DATA_BLOCK_TRANSFER) &&
          useInputDestinations.getState().destinations.some((item) => item.id === destination)
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (
          !(
            event.relatedTarget instanceof Element &&
            event.currentTarget.contains(event.relatedTarget)
          )
        )
          setDragOver(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(DATA_BLOCK_TRANSFER)) return;
        event.preventDefault();
        setDragOver(false);
        if (!disabled)
          useInputDestinations
            .getState()
            .drop(destination, event.dataTransfer.getData(DATA_BLOCK_TRANSFER));
      }}
    >
      <div
        data-guidance={guidanceTarget}
        data-guidance-stage={!disabled ? 'setup' : undefined}
        role="group"
        aria-label={`${title} controls`}
        className="scroll-mt-16 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 pt-1.5"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="block text-body font-medium text-description">
            {title} ({countLabel})
          </label>
        </div>
        <div
          data-testid="node-inputs-actions"
          className="ml-auto flex flex-wrap items-center justify-end gap-1.5 @max-[430px]/node-inputs:ml-0 @max-[430px]/node-inputs:basis-full @max-[430px]/node-inputs:justify-start"
        >
          {selectionItems.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-label-secondary text-description"
              onClick={onClear}
              disabled={disabled}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Clear all
            </Button>
          )}

          {/* Add data block: searchable list of addable project nodes. */}
          <Popover
            open={blockOpen}
            onOpenChange={(open) => {
              setBlockOpen(open);
              if (!open) setBlockSearch('');
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-label-secondary"
                disabled={disabled || !canAddMore || availableNodes.length === 0}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Add data block
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="border-b p-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-description"
                    aria-hidden="true"
                  />
                  <Input
                    autoFocus
                    value={blockSearch}
                    onChange={(e) => {
                      setBlockSearch(e.target.value);
                    }}
                    placeholder="Search data blocks…"
                    className="h-8 pl-7 text-body"
                  />
                </div>
              </div>
              {showAddAll && filteredAvailableNodes.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="m-2"
                  onClick={() => {
                    handleAdd(filteredAvailableNodes.map((node) => node.id));
                    setBlockOpen(false);
                    setBlockSearch('');
                  }}
                >
                  Add all ({filteredAvailableNodes.length})
                </Button>
              )}
              <div className="max-h-64 overflow-y-auto py-1">
                {filteredAvailableNodes.length === 0 ? (
                  <div className="px-3 py-3 text-center text-label-secondary text-description">
                    No matching data blocks
                  </div>
                ) : (
                  filteredAvailableNodes.map((node) => {
                    const id = node.id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="flex w-full items-start px-3 py-2 text-left text-body hover:bg-panel/60"
                        onClick={() => {
                          handleAdd([id]);
                          setBlockOpen(false);
                          setBlockSearch('');
                        }}
                      >
                        <span className="truncate">{node.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selectionItems.length === 0 ? (
        <div className="mx-3 rounded-md border border-dashed border-surface-border-foreground/40 bg-panel/40 p-3 text-body italic text-description">
          {emptyMessage ?? (
            <>
              No data blocks selected. Use{' '}
              <span className="font-medium not-italic">Add data block</span> or a Data Block&apos;s{' '}
              <span className="not-italic">+</span> button to add an input.
            </>
          )}
        </div>
      ) : (
        <NodeSelectionList
          renderHeaderControl={
            onNodeColorChange
              ? (args) => (
                  <NodeColorPicker
                    nodeName={args.node.name}
                    color={args.color}
                    presets={defaultPalette}
                    disabled={disabled}
                    onChange={(nextColor) => {
                      onNodeColorChange(args.nodeId, nextColor);
                    }}
                  />
                )
              : undefined
          }
          items={selectionItems}
          palette={defaultPalette}
          nodeColors={nodeColors}
          maxCompare={maxVisibleCards ?? maxNodes ?? selectionItems.length}
          onRemoveNode={!disabled ? onRemoveNode : undefined}
          renderNodeBody={showColumnPicker ? renderColumnBody : undefined}
          renderExtraNodeContent={renderExtraNodeBody}
        />
      )}
      {maxNodes != null && count > maxNodes && (
        <div className="mt-1 flex items-center gap-1 px-3 text-body text-warning">
          Maximum {maxNodes} data block{maxNodes === 1 ? '' : 's'} allowed here. Currently {count}{' '}
          selected.
        </div>
      )}
    </div>
  );
}
