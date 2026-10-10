/**
 * Reorder result table columns by dragging a header's grip (issue 373).
 *
 * The grip is apart from the header's label, and its click never reaches the
 * header, so clicking a header still sorts and dragging never does.
 * Keyboard: focus the grip, Space to pick up, arrows to move, Space to drop.
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { moveColumn } from '../columnOrder';

const ReorderEnabled = createContext(false);

/** Wraps a table whose header cells are DraggableTableHead; ids are the shown columns in order. */
export function ColumnReorderProvider({
  ids,
  onReorder,
  children,
}: {
  ids: readonly string[];
  /** Without it the table has plain headers. */
  onReorder?: (order: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!onReorder || !over || active.id === over.id) return;
    onReorder(moveColumn(ids, String(active.id), String(over.id)));
  };
  if (!onReorder) return children;
  return (
    <ReorderEnabled.Provider value>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={[...ids]} strategy={horizontalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
    </ReorderEnabled.Provider>
  );
}

/**
 * A results table header cell that can be dragged by its grip. Without a
 * ColumnReorderProvider around the table it renders a plain header cell.
 */
export function DraggableTableHead({
  id,
  label,
  className,
  onClick,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const enabled = useContext(ReorderEnabled);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });
  const style: CSSProperties | undefined = enabled
    ? {
        transform: CSS.Translate.toString(transform),
        transition,
        ...(isDragging ? { position: 'relative', zIndex: 2, opacity: 0.85 } : {}),
      }
    : undefined;
  return (
    <TableHead ref={setNodeRef} style={style} className={className} onClick={onClick}>
      {enabled ? (
        <button
          type="button"
          aria-label={`Move column ${label}`}
          title="Drag to move this column"
          className="mr-1 inline-flex shrink-0 cursor-grab touch-none items-center rounded-sm align-middle text-description opacity-50 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(event) => {
            // The header's own click sorts; the grip never does.
            event.stopPropagation();
          }}
        >
          <GripVertical aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
      {children}
    </TableHead>
  );
}
