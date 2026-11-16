import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One code in the Edit codebook window, dragged by its grip (Chao, 16 Nov
 * 2026). Keyboard: focus the grip, Space to pick up, arrows to move, Space to
 * drop. The grip is apart from the fields, so typing never starts a drag.
 */
export function SortableCodeRow({
  id,
  handleLabel,
  children,
}: {
  id: string;
  handleLabel: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex items-start gap-2', isDragging && 'relative z-10 opacity-80')}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={handleLabel}
        title="Drag to reorder"
        className="mt-2 shrink-0 cursor-grab touch-none rounded-sm text-description hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}
