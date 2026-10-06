import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { getCategoryValues, type CategoryValuesResource } from '@/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import { moveLabel, orderedLabels, type CategoryOrderMode } from '../utils/categoryOrder';

interface CategoryOrderPanelProps {
  open: boolean;
  workspaceId: string | undefined;
  nodeId: string | undefined;
  columnName: string;
  /** True when the column is already a category, so the window changes its order. */
  isCategory: boolean;
  onClose: () => void;
  onConfirm: (categories: string[]) => void;
}

/**
 * Category conversion window (issue 318): lists a column's values as chips in
 * the order they will take in tables, lists, legends and charts. Opened from a
 * column's type menu by choosing "category", also on a category column to
 * change its order. Empty values are not a category and always come last.
 */
export function CategoryOrderPanel({ open, onClose, ...contentProps }: CategoryOrderPanelProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {open && <CategoryOrderPanelContent {...contentProps} onClose={onClose} />}
    </Dialog>
  );
}

const MODE_LABELS: Record<'text' | 'value', Record<'ascending' | 'descending', string>> = {
  text: { ascending: 'A to Z', descending: 'Z to A' },
  value: { ascending: 'Smallest first', descending: 'Largest first' },
};

function CategoryOrderPanelContent({
  workspaceId,
  nodeId,
  columnName,
  isCategory,
  onClose,
  onConfirm,
}: Omit<CategoryOrderPanelProps, 'open'>) {
  const valuesQuery = useQuery({
    queryKey: [
      'workspaces',
      workspaceId ?? '',
      'nodes',
      nodeId ?? '',
      'category-values',
      columnName,
    ],
    enabled: Boolean(workspaceId && nodeId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data } = await getCategoryValues({
        path: { workspace_id: workspaceId ?? '', node_id: nodeId ?? '' },
        query: { column: columnName },
        throwOnError: true,
      });
      return data;
    },
  });
  const values = valuesQuery.data;
  const title = isCategory ? (
    <>
      Order of <span className="text-description">&ldquo;{columnName}&rdquo;</span>
    </>
  ) : (
    <>
      Convert <span className="text-description">&ldquo;{columnName}&rdquo;</span> to category
    </>
  );

  return (
    <DialogContent className="w-full max-w-lg border-none bg-transparent p-0 shadow-none">
      <DialogHeader className="sr-only">
        <DialogTitle>
          {isCategory ? `Order of ${columnName}` : `Convert ${columnName} to category`}
        </DialogTitle>
        <DialogDescription>Choose the order of the values.</DialogDescription>
      </DialogHeader>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Tables, lists, legends and charts show the values in this order. Empty values always
            come last.
          </CardDescription>
        </CardHeader>
        {values ? (
          <CategoryOrderForm
            key={values.labels.join('\u0000')}
            values={values}
            isCategory={isCategory}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        ) : (
          <>
            <CardContent>
              {valuesQuery.isError ? (
                <ErrorNotice
                  error={valuesQuery.error}
                  fallback="Couldn't read the column's values."
                />
              ) : (
                <p className="text-body text-description">Reading the values…</p>
              )}
            </CardContent>
            <CardFooter className="border-t border-surface-border/70 pt-4">
              <div className="flex w-full justify-end">
                <Button variant="outline" type="button" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </CardFooter>
          </>
        )}
      </Card>
    </DialogContent>
  );
}

function CategoryOrderForm({
  values,
  isCategory,
  onClose,
  onConfirm,
}: {
  values: CategoryValuesResource;
  isCategory: boolean;
  onClose: () => void;
  onConfirm: (categories: string[]) => void;
}) {
  const { kind, is_ordered: isOrdered, labels: defaults } = values;
  const canCustomise = defaults.length <= values.max_custom_values;
  const [mode, setMode] = useState<CategoryOrderMode>(isOrdered ? 'current' : 'ascending');
  const [customLabels, setCustomLabels] = useState<string[]>(defaults);
  const shown = mode === 'custom' ? customLabels : orderedLabels(defaults, mode, kind, isOrdered);
  const counts = new Map(defaults.map((label, index) => [label, values.counts[index] ?? 0]));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const modes: { value: CategoryOrderMode; label: string }[] = [
    ...(isOrdered ? [{ value: 'current' as const, label: 'Current order' }] : []),
    { value: 'ascending', label: MODE_LABELS[kind].ascending },
    { value: 'descending', label: MODE_LABELS[kind].descending },
    { value: 'custom', label: 'Custom' },
  ];

  /** Dragging a chip switches to Custom, starting from the order shown. */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!canCustomise || !over || active.id === over.id) return;
    setCustomLabels(moveLabel(shown, String(active.id), String(over.id)));
    setMode('custom');
  };

  return (
    <>
      <CardContent className="space-y-3">
        <fieldset>
          <legend className="mb-1.5 text-body font-medium text-foreground">Order</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Order">
            {modes.map((option) => {
              const disabled = option.value === 'custom' && !canCustomise;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={mode === option.value}
                  variant={mode === option.value ? 'default' : 'outline'}
                  disabled={disabled}
                  title={
                    disabled
                      ? `Custom order is available for up to ${String(values.max_custom_values)} values.`
                      : undefined
                  }
                  onClick={() => {
                    if (option.value === 'custom' && mode !== 'custom') setCustomLabels(shown);
                    setMode(option.value);
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
          <p className="mt-1.5 text-label-secondary text-description">
            {canCustomise
              ? 'Drag a value, or focus it and use Space and the arrow keys, to set a custom order.'
              : `This column has ${String(defaults.length)} values. Custom order is available for up to ${String(values.max_custom_values)}.`}
          </p>
        </fieldset>
        {defaults.length === 0 ? (
          <p className="text-body text-description">This column has only empty values.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={shown} strategy={verticalListSortingStrategy}>
              <ol
                aria-label="Values in order"
                className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-surface-border p-1.5"
              >
                {shown.map((label) => (
                  <SortableValue
                    key={label}
                    label={label}
                    count={counts.get(label) ?? 0}
                    draggable={canCustomise}
                  />
                ))}
                {values.empty_count > 0 ? (
                  <li
                    className="flex items-center gap-2 rounded-sm border border-dashed border-surface-border px-2 py-1 text-body text-description"
                    aria-label={`Empty, ${String(values.empty_count)} rows, always last`}
                  >
                    <span className="flex-1 italic">empty (always last)</span>
                    <span className="tabular-nums">{values.empty_count.toLocaleString()}</span>
                  </li>
                ) : null}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
      <CardFooter className="border-t border-surface-border/70 pt-4">
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={shown.length === 0}
            onClick={() => {
              onConfirm(shown);
            }}
          >
            {isCategory ? 'Apply order' : 'Convert'}
          </Button>
        </div>
      </CardFooter>
    </>
  );
}

function SortableValue({
  label,
  count,
  draggable,
}: {
  label: string;
  count: number;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: label,
    disabled: !draggable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-sm border border-surface-border bg-editor px-2 py-1 text-body ${
        isDragging ? 'relative z-10 shadow-md' : ''
      } ${draggable ? 'cursor-grab touch-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus' : ''}`}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      aria-label={draggable ? `${label}, ${String(count)} rows. Press Space to move.` : undefined}
    >
      {draggable ? <GripVertical aria-hidden="true" className="size-3.5 text-description" /> : null}
      <span className="flex-1 [overflow-wrap:anywhere]">{label}</span>
      <span className="tabular-nums text-description">{count.toLocaleString()}</span>
    </li>
  );
}
