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

/**
 * The window lists at most this many values so it stays responsive; the rest
 * follow in the chosen order (Chao, 2026-10-07).
 */
export const SHOWN_CATEGORY_VALUES = 300;

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
  // The first read samples a column that looks like text; every value is read
  // only after the user continues (Chao, 2026-10-07).
  const [readAll, setReadAll] = useState(false);
  const valuesQuery = useQuery({
    queryKey: [
      'workspaces',
      workspaceId ?? '',
      'nodes',
      nodeId ?? '',
      'category-values',
      columnName,
      readAll,
    ],
    enabled: Boolean(workspaceId && nodeId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    // Cancel closes the window, which drops the request.
    queryFn: async ({ signal }) => {
      const { data } = await getCategoryValues({
        path: { workspace_id: workspaceId ?? '', node_id: nodeId ?? '' },
        query: { column: columnName, read_all: readAll },
        signal,
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
        {values && !values.complete ? (
          <SampleWarning
            values={values}
            columnName={columnName}
            onClose={onClose}
            onContinue={() => {
              setReadAll(true);
            }}
          />
        ) : values ? (
          <CategoryOrderForm
            key={values.labels.join('\u0000')}
            values={values}
            isCategory={isCategory}
            longListAccepted={readAll}
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
                <p className="text-body text-description" aria-live="polite">
                  {readAll
                    ? 'Reading every value. A long column can take a while; Cancel stops.'
                    : 'Reading the values…'}
                </p>
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

/**
 * Asks before reading a whole column that looks like text: its first rows
 * already hold many values, or it is the Data Block's document column.
 */
function SampleWarning({
  values,
  columnName,
  onClose,
  onContinue,
}: {
  values: CategoryValuesResource;
  columnName: string;
  onClose: () => void;
  onContinue: () => void;
}) {
  const manyValues = values.sample_distinct > values.warn_values;
  return (
    <>
      <CardContent className="space-y-2">
        <p role="alert" className="text-body text-foreground">
          {values.is_document
            ? `"${columnName}" is this Data Block's document column. Each different text would become its own category.`
            : `"${columnName}" has many different values for a category.`}{' '}
          {manyValues
            ? `Its first ${values.sample_rows.toLocaleString()} rows already have ${values.sample_distinct.toLocaleString()} different values.`
            : ''}
        </p>
        <p className="text-body text-description">
          Continue reads every value, which can take a while for a long column, and lists them all.
        </p>
      </CardContent>
      <CardFooter className="border-t border-surface-border/70 pt-4">
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </CardFooter>
    </>
  );
}

function CategoryOrderForm({
  values,
  isCategory,
  longListAccepted: alreadyAccepted,
  onClose,
  onConfirm,
}: {
  values: CategoryValuesResource;
  isCategory: boolean;
  /** True when the user already continued past the sample warning. */
  longListAccepted: boolean;
  onClose: () => void;
  onConfirm: (categories: string[]) => void;
}) {
  const { kind, is_ordered: isOrdered, labels: defaults } = values;
  // A long list is the user's call: warn first, then list every value (Chao, 2026-10-07).
  const [longListAccepted, setLongListAccepted] = useState(
    alreadyAccepted || defaults.length <= values.warn_values,
  );
  const [mode, setMode] = useState<CategoryOrderMode>(isOrdered ? 'current' : 'ascending');
  const [customLabels, setCustomLabels] = useState<string[]>(defaults);
  const counts = new Map(defaults.map((label, index) => [label, values.counts[index] ?? 0]));
  // Every value in its order; only the first SHOWN_CATEGORY_VALUES are listed.
  const order =
    mode === 'custom' ? customLabels : orderedLabels(defaults, mode, kind, isOrdered, counts);
  const shown = order.slice(0, SHOWN_CATEGORY_VALUES);
  const hiddenCount = order.length - shown.length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Presets only: dragging a value at any time makes a custom order, so no
  // preset is then selected.
  const modes: { value: Exclude<CategoryOrderMode, 'custom'>; label: string }[] = [
    ...(isOrdered ? [{ value: 'current' as const, label: 'Current order' }] : []),
    { value: 'ascending', label: MODE_LABELS[kind].ascending },
    { value: 'descending', label: MODE_LABELS[kind].descending },
    { value: 'most', label: 'Most rows first' },
    { value: 'fewest', label: 'Fewest rows first' },
  ];

  /** Dragging a value makes a custom order, starting from the order shown. */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setCustomLabels(moveLabel(order, String(active.id), String(over.id)));
    setMode('custom');
  };

  if (!longListAccepted) {
    return (
      <>
        <CardContent>
          <p role="alert" className="text-body text-foreground">
            This column has {defaults.length.toLocaleString()} different values. Each becomes a
            category, so the list will be long to scroll and arrange, and lists and charts that show
            every value (such as Filter&apos;s value list or a Trends axis) will be long too.
            {defaults.length > SHOWN_CATEGORY_VALUES
              ? ` This window shows only the first ${String(SHOWN_CATEGORY_VALUES)}. A column like this is usually better kept as text.`
              : ''}
          </p>
        </CardContent>
        <CardFooter className="border-t border-surface-border/70 pt-4">
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setLongListAccepted(true);
              }}
            >
              Continue
            </Button>
          </div>
        </CardFooter>
      </>
    );
  }

  return (
    <>
      <CardContent className="space-y-3">
        <fieldset>
          <legend className="mb-1.5 text-body font-medium text-foreground">Order</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Order">
            {modes.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                role="radio"
                aria-checked={mode === option.value}
                variant={mode === option.value ? 'default' : 'outline'}
                onClick={() => {
                  setMode(option.value);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-label-secondary text-description" aria-live="polite">
            {mode === 'custom' ? 'Your own order. ' : ''}
            Drag a value, or focus it and use Space and the arrow keys, to move it.
          </p>
        </fieldset>
        {hiddenCount > 0 ? (
          <p
            role="note"
            className="rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-body text-foreground"
          >
            Showing the first {SHOWN_CATEGORY_VALUES} of {order.length.toLocaleString()} values. The
            other {hiddenCount.toLocaleString()} follow in the order chosen above and can&apos;t be
            dragged. A column with this many values is usually better kept as text, so consider
            cancelling.
          </p>
        ) : null}
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
                  <SortableValue key={label} label={label} count={counts.get(label) ?? 0} />
                ))}
                {hiddenCount > 0 ? (
                  <li className="px-2 py-1 text-body italic text-description">
                    … and {hiddenCount.toLocaleString()} more values
                  </li>
                ) : null}
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
            disabled={order.length === 0}
            onClick={() => {
              onConfirm(order);
            }}
          >
            {isCategory ? 'Apply order' : 'Convert'}
          </Button>
        </div>
      </CardFooter>
    </>
  );
}

function SortableValue({ label, count }: { label: string; count: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: label,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-sm border border-surface-border bg-editor px-2 py-1 text-body ${
        isDragging ? 'relative z-10 shadow-md' : ''
      } cursor-grab touch-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus`}
      {...attributes}
      {...listeners}
      aria-label={`${label}, ${String(count)} rows. Press Space to move.`}
    >
      <GripVertical aria-hidden="true" className="size-3.5 text-description" />
      <span className="flex-1 [overflow-wrap:anywhere]">{label}</span>
      <span className="tabular-nums text-description">{count.toLocaleString()}</span>
    </li>
  );
}
