import { Layers3 } from 'lucide-react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { useDataBlockDragStore } from '@/stores/dataBlockDragStore';

const POINTER_OFFSET = 14;

/**
 * The chip that follows the pointer while a Data Block is dragged from the
 * Project Graph (Chao, 15 Nov 2026). It names the block and says where a
 * release would put it. It ignores the pointer, so the box underneath is
 * still found.
 * Rendered by: WorkspaceShell, beside the carried-stack follower.
 */
export function DataBlockDragLayer() {
  const drag = useDataBlockDragStore((state) => state.drag);
  if (!drag) return null;
  const { resolution } = drag;
  const blocked = resolution.kind === 'target' && Boolean(resolution.blockedReason);
  const hint =
    resolution.kind === 'target'
      ? (resolution.blockedReason ?? `Add to ${resolution.title}`)
      : resolution.kind === 'choose-box'
        ? 'Drop on a highlighted box'
        : 'Drag onto a tool’s Data Blocks box';

  return createPortal(
    <div
      role="status"
      aria-label={`Dragging ${drag.name}`}
      data-testid="data-block-drag-chip"
      className={cn(
        'pointer-events-none fixed z-[100] max-w-64 rounded-md border bg-editor/95 px-2.5 py-1.5 text-body',
        blocked
          ? 'border-error/60'
          : resolution.kind === 'target'
            ? 'border-button'
            : 'border-surface-border',
      )}
      style={{ left: drag.x + POINTER_OFFSET, top: drag.y + POINTER_OFFSET }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Layers3 className="size-3.5 shrink-0 text-link" aria-hidden="true" />
        <span className="min-w-0 truncate font-medium text-foreground">{drag.name}</span>
      </div>
      <div className={cn('text-badge', blocked ? 'text-error' : 'text-description')}>{hint}</div>
    </div>,
    document.body,
  );
}
