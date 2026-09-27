import { useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { useBuildSubTab } from '../hooks/useBuildSubTab';
import { useBuildBuilderDrag } from '../hooks/useBuildBuilderDrag';
import {
  buildCombinations,
  buildTypeLabel,
  partChain,
  inspectBuildPart,
  type BuildBuilderToken,
  type BuildCombination,
} from '../hooks/buildExpressionModel';
import { findExpression } from '../expressionTree';
import {
  buildType,
  operationDefinition,
  type BuildChain,
  type BuildOperation,
} from '../operations';
import { OperationPopover } from './OperationPopover';
import { LiteralPopover } from './LiteralPopover';
import { CombinationPopover } from './CombinationPopover';

function chain(read: () => BuildChain): BuildChain | null {
  try {
    return read();
  } catch {
    return null;
  }
}
const column = (name: string): BuildBuilderToken => ({
  id: crypto.randomUUID(),
  kind: 'column',
  column: name,
  operations: [],
});
const label = (node: BuildBuilderToken): string =>
  node.kind === 'column'
    ? node.column
    : node.kind === 'literal'
      ? node.literalType === 'null'
        ? 'NULL'
        : node.literalType === 'text'
          ? `“${node.value}”`
          : node.value
      : node.kind === 'sql'
        ? 'SQL expression'
        : (buildCombinations.find((item) => item.kind === node.combination?.kind)?.label ??
          'Choose function');

type Controller = ReturnType<typeof useBuildSubTab>;
interface Context {
  build: Controller;
  drag: ReturnType<typeof useBuildBuilderDrag>;
  focused: string | null;
  focus: (id: string | null) => void;
  add: (node: BuildBuilderToken, parent: string | null, index?: number) => void;
}
export function BubbleBuilder({ build }: { build: Controller }) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [chooseRoot, setChooseRoot] = useState(false);
  const roots = build.draft.visual.roots;
  const current = focused ? findExpression(roots, focused) : undefined;
  const destination = current?.kind === 'combination' ? current.id : null;
  const add = (node: BuildBuilderToken, parent: string | null, index = Number.MAX_SAFE_INTEGER) => {
    build.addPart(node, parent, index);
    if (parent === null && roots.length >= 1) setChooseRoot(true);
  };
  const move = (id: string, parent: string | null, index: number) => {
    build.movePart(id, parent, index);
    if (parent === null && roots.length >= 1 && !roots.some((node) => node.id === id))
      setChooseRoot(true);
  };
  const drag = useBuildBuilderDrag(
    roots,
    (name, target) => {
      add(column(name), target.parent, target.index);
    },
    (id, target) => {
      move(id, target.parent, target.index);
    },
  );
  const context: Context = {
    build,
    drag,
    focused: destination,
    focus: setFocused,
    add,
  };
  const combineRoot = (combination: BuildCombination) => {
    const id = crypto.randomUUID();
    build.updateVisual((visual) => ({
      ...visual,
      roots: [{ id, kind: 'combination', combination, children: visual.roots, operations: [] }],
    }));
    setFocused(id);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-32 flex-1"
          aria-label="Search columns"
          placeholder="Search columns…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          disabled={!build.activeNode}
        />
        <LiteralPopover
          onConfirm={(value) => {
            add(value, destination);
          }}
        >
          <Button variant="outline" size="sm" disabled={!build.activeNode}>
            <Plus />
            Add value
          </Button>
        </LiteralPopover>
      </div>
      <div
        className="flex max-h-44 min-w-0 flex-wrap content-start gap-1.5 overflow-y-auto p-1"
        aria-label="Available columns"
      >
        {build.columns
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .map((item) => (
            <Button
              key={item.name}
              variant="outline"
              size="sm"
              className={cn(
                'h-auto max-w-full touch-none select-none rounded-full px-3 py-1.5 text-left',
                drag.dragged?.kind === 'column' &&
                  drag.dragged.column === item.name &&
                  'opacity-40',
              )}
              {...drag.source({ kind: 'column', column: item.name })}
              onClick={() => {
                add(column(item.name), destination);
              }}
              title={`${item.name} · ${buildTypeLabel(buildType(item.field))}`}
              aria-label={`Add column ${item.name}`}
            >
              <span className="truncate">{item.name}</span>
            </Button>
          ))}
      </div>
      <p className="text-body text-description">
        Drag columns into the builder. Click a placed bubble to add operations.
      </p>
      <div className="min-w-0" aria-label="Expression builder">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button
            variant={destination === null ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setFocused(null);
            }}
          >
            Expression root
          </Button>
          <span
            className="min-w-0 truncate text-body text-description"
            title={current ? label(current) : undefined}
          >
            Adding to {current ? label(current) : 'root'}
          </span>
        </div>
        <Children nodes={roots} parent={null} context={context} />
        {roots.length > 1 && (
          <div className="mt-3">
            <CombinationPopover
              open={chooseRoot}
              onOpenChange={setChooseRoot}
              chains={roots.map((node) => chain(() => partChain(node, build.columns)))}
              onChange={combineRoot}
            >
              <Button variant="outline" size="sm">
                Choose how to combine
              </Button>
            </CombinationPopover>
            <p className="mt-1 text-body text-description">
              Choose a function to combine these bubbles, or move one inside another.
            </p>
          </div>
        )}
      </div>
      <span aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
      {drag.preview &&
        drag.dragged &&
        createPortal(
          <div
            data-testid="build-drag-preview"
            aria-hidden="true"
            className="pointer-events-none fixed z-50 flex max-w-80 items-center gap-2 rounded-full border border-focus bg-editor px-3 py-1.5 text-body text-foreground shadow-lg"
            style={{ left: drag.preview.x, top: drag.preview.y }}
          >
            <GripVertical className="size-3 shrink-0" />
            <DragPreview value={drag.dragged} roots={roots} />
          </div>,
          document.body,
        )}
    </div>
  );
}
function DragPreview({
  value,
  roots,
}: {
  value: NonNullable<Context['drag']['dragged']>;
  roots: BuildBuilderToken[];
}) {
  const node = value.kind === 'expression' ? findExpression(roots, value.id) : undefined;
  return (
    <>
      <span className="truncate">
        {value.kind === 'column' ? value.column : node ? label(node) : ''}
      </span>
      {node?.kind === 'combination' && (
        <span className="shrink-0 text-description">{node.children.length} inputs</span>
      )}
    </>
  );
}
function DropSlot({
  parent,
  index,
  context,
  horizontal = false,
}: {
  parent: string | null;
  index: number;
  context: Context;
  horizontal?: boolean;
}) {
  const { drag } = context;
  const active = drag.over?.parent === parent && drag.over.index === index;
  const container = parent ? findExpression(context.build.draft.visual.roots, parent) : undefined;
  return (
    <span
      aria-hidden="true"
      data-drop-parent={parent ?? 'root'}
      data-drop-index={index}
      data-drop-description={`Position ${String(index + 1)} in ${container ? label(container) : 'root'}`}
      {...drag.target({ parent, index })}
      className={cn(
        'absolute z-10 rounded',
        horizontal ? '-top-1.5 left-0 h-2 w-full' : '-left-1.5 top-0 h-full min-h-8 w-2',
        drag.dragged ? 'pointer-events-auto' : 'pointer-events-none',
        active && 'bg-focus',
      )}
    />
  );
}
function Children({
  nodes,
  parent,
  context,
}: {
  nodes: BuildBuilderToken[];
  parent: string | null;
  context: Context;
}) {
  return (
    <div
      className="relative flex min-h-10 min-w-0 flex-wrap items-center gap-2"
      {...context.drag.target({ parent, index: nodes.length })}
    >
      {nodes.map((node, index) => (
        <div
          key={node.id}
          className={cn('relative min-w-0 max-w-full', node.kind === 'combination' && 'basis-full')}
        >
          <DropSlot
            parent={parent}
            index={index}
            context={context}
            horizontal={node.kind === 'combination'}
          />
          <Bubble node={node} index={index} parent={parent} context={context} />
        </div>
      ))}
      <div
        className="relative flex flex-wrap items-center gap-1"
        onFocusCapture={(event) => {
          event.stopPropagation();
          context.focus(parent);
        }}
      >
        <DropSlot parent={parent} index={nodes.length} context={context} />
        <CombinationPopover
          chains={[]}
          onChange={(combination) => {
            const id = crypto.randomUUID();
            context.add(
              { id, kind: 'combination', combination, children: [], operations: [] },
              parent,
            );
            context.focus(id);
          }}
        >
          <Button variant="ghost" size="sm" disabled={!context.build.activeNode}>
            <Plus />
            Add function
          </Button>
        </CombinationPopover>
        {parent && (
          <LiteralPopover
            onConfirm={(value) => {
              context.add(value, parent);
            }}
          >
            <Button variant="ghost" size="sm">
              <Plus />
              Value
            </Button>
          </LiteralPopover>
        )}
      </div>
      {!nodes.length && <span className="px-2 text-body text-description">Drop columns here</span>}
    </div>
  );
}
function Bubble({
  node,
  index,
  parent,
  context,
}: {
  node: BuildBuilderToken;
  index: number;
  parent: string | null;
  context: Context;
}) {
  const { build, drag } = context;
  const update = (next: BuildBuilderToken) => {
    build.updatePart(node.id, () => next);
  };
  const fullChain = chain(() => partChain(node, build.columns));
  const inspected = inspectBuildPart(node, build.columns);
  const result = inspected.issue?.label ?? buildTypeLabel(inspected.chain.type);
  const append = (operation: BuildOperation) => {
    update({ ...node, operations: [...node.operations, operation] });
  };
  const menuButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto min-h-8 min-w-0 max-w-full rounded-full px-2 text-left"
      title={label(node)}
    >
      <span className="truncate">{label(node)}</span>
    </Button>
  );
  const operationMenu = (
    <OperationPopover chain={fullChain} onSelect={append}>
      <Button variant="ghost" size="sm">
        <Plus />
        Add operation
      </Button>
    </OperationPopover>
  );
  return (
    <div
      className={cn(
        'min-w-0 max-w-full rounded-2xl border border-surface-border bg-editor',
        node.kind === 'combination' ? 'p-2' : 'px-1',
        drag.dragged?.kind === 'expression' && drag.dragged.id === node.id && 'opacity-40',
        node.kind === 'combination' && context.focused === node.id && 'ring-1 ring-focus',
      )}
      data-testid="build-bubble"
      data-expression-id={node.id}
      onFocusCapture={(event) => {
        event.stopPropagation();
        context.focus(node.kind === 'combination' ? node.id : parent);
      }}
      data-build-leaf={node.kind !== 'combination' || undefined}
      {...drag.target(
        node.kind === 'combination'
          ? { parent: node.id, index: node.children.length }
          : { parent, index },
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 touch-none select-none cursor-grab"
          data-drag-handle
          title="Space to pick up, arrows to move, Enter to drop, Escape to cancel"
          aria-label={`Drag ${label(node)}`}
          {...drag.source({ kind: 'expression', id: node.id })}
        >
          <GripVertical className="size-3" />
        </Button>
        {node.kind === 'combination' ? (
          <CombinationPopover
            value={node.combination}
            chains={node.children.map((child) => chain(() => partChain(child, build.columns)))}
            onChange={(combination) => {
              update({ ...node, combination });
            }}
            footer={operationMenu}
          >
            {menuButton}
          </CombinationPopover>
        ) : node.kind === 'column' ? (
          <OperationPopover chain={fullChain} onSelect={append}>
            {menuButton}
          </OperationPopover>
        ) : node.kind === 'literal' ? (
          <LiteralPopover part={node} onConfirm={update}>
            {menuButton}
          </LiteralPopover>
        ) : (
          <SqlBubble node={node} onChange={update} />
        )}
        {node.operations.map((operation, i) => (
          <span key={i} className="flex min-w-0 max-w-full items-center gap-0.5">
            <OperationPopover
              chain={chain(() =>
                partChain({ ...node, operations: node.operations.slice(0, i) }, build.columns),
              )}
              operation={operation}
              onSelect={(next) => {
                update({
                  ...node,
                  operations: node.operations.map((item, j) => (j === i ? next : item)),
                });
              }}
            >
              <Button
                variant="secondary"
                size="sm"
                className="h-auto min-h-7 max-w-full rounded-full px-2 text-left"
                title={Object.values(operation.arguments).join(', ')}
                aria-label={`Edit ${operationDefinition(operation.kind).label}`}
              >
                <span className="truncate">
                  {operationDefinition(operation.kind).label}
                  {Object.keys(operation.arguments).length
                    ? ` (${Object.values(operation.arguments).join(', ')})`
                    : ''}
                </span>
              </Button>
            </OperationPopover>
            {i === node.operations.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                title={`Remove last operation: ${operationDefinition(operation.kind).label}`}
                aria-label={`Remove ${operationDefinition(operation.kind).label}`}
                onClick={() => {
                  update({ ...node, operations: node.operations.slice(0, -1) });
                }}
              >
                <X className="size-3" />
              </Button>
            )}
          </span>
        ))}
        <span
          className={cn(
            'px-1 text-label-secondary',
            inspected.issue?.kind === 'invalid' ? 'text-error' : 'text-description',
          )}
          title={inspected.issue?.reason ?? result}
        >
          {result}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`Remove expression ${label(node)}`}
          title={`Remove expression ${label(node)}`}
          onClick={() => {
            build.removePart(node.id);
          }}
        >
          <X className="size-3.5" />
        </Button>
        {node.kind !== 'column' && node.kind !== 'combination' && operationMenu}
      </div>
      {inspected.issue?.kind === 'invalid' && (
        <p className="px-2 pb-1 text-body text-error">{inspected.issue.reason}</p>
      )}
      {node.kind === 'combination' && (
        <div className="mt-2 pl-2">
          <Children nodes={node.children} parent={node.id} context={context} />
        </div>
      )}
    </div>
  );
}
function SqlBubble({
  node,
  onChange,
}: {
  node: Extract<BuildBuilderToken, { kind: 'sql' }>;
  onChange: (node: BuildBuilderToken) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(node.expression);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(node.expression);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 max-w-full rounded-full font-mono"
          title={node.expression}
        >
          <span className="truncate">SQL: {node.expression}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] space-y-3">
        <p className="font-medium">SQL expression</p>
        <Textarea
          aria-label="SQL bubble expression"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          className="font-mono"
        />
        <p className="text-body text-description">
          This fragment is kept as SQL. DuckDB validates it in the preview.
        </p>
        <Button
          size="sm"
          onClick={() => {
            onChange({ ...node, expression: value });
            setOpen(false);
          }}
        >
          Save expression
        </Button>
      </PopoverContent>
    </Popover>
  );
}
