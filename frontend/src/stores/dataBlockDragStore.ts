import type { PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';

/**
 * Dragging a Data Block from the Project Graph onto a tool (Chao, 15 Nov
 * 2026). People kept trying it, and touch screens teach it.
 *
 * The block itself never moves: graph positions stay with the layout. A drag
 * that starts on a block lifts a small chip that follows the pointer; each
 * inputs box (NodeInputsPanel) is a drop target, and releasing on one adds
 * the block there, like its Add Data Block button. Released elsewhere on the
 * tool, the block goes to the tool's only box, if it has just one.
 *
 * Kept apart from the "carried" stack (nodeInputRequestsStore): carrying is
 * click, move, click; this is one press-drag-release and leaves nothing
 * pending.
 */

/** Marks an inputs box; the value is its registered id. */
export const DROP_TARGET_ATTRIBUTE = 'data-data-block-drop-target';
/** Marks the tool area: a drop anywhere in it goes to the tool's only box. */
export const DROP_ZONE_ATTRIBUTE = 'data-data-block-drop-zone';
/** Pointer travel, in pixels, before a press on a block becomes a drag. */
const DRAG_THRESHOLD = 6;

interface DataBlockDropTarget {
  /** The box's title, named in the chip while the pointer is over it. */
  title: string;
  /** Why the box can't take a block now (full, or locked while running). */
  blockedReason?: string;
  add: (nodeId: string) => void;
}

const targets = new Map<string, DataBlockDropTarget>();

/** Registers an inputs box as a drop target; returns its unregister function. */
export function registerDataBlockDropTarget(id: string, target: DataBlockDropTarget): () => void {
  targets.set(id, target);
  return () => {
    if (targets.get(id) === target) targets.delete(id);
  };
}

/** Where a release at the pointer would put the block. */
type DropResolution =
  | { kind: 'target'; id: string; title: string; blockedReason?: string }
  /** On the tool, but it has several boxes: the person must pick one. */
  | { kind: 'choose-box' }
  | { kind: 'none' };

interface DataBlockDrag {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  resolution: DropResolution;
}

interface DataBlockDragState {
  drag: DataBlockDrag | null;
  start: (drag: DataBlockDrag) => void;
  move: (x: number, y: number, resolution: DropResolution) => void;
  end: () => void;
}

export const useDataBlockDragStore = create<DataBlockDragState>((set) => ({
  drag: null,
  start: (drag) => {
    set({ drag });
  },
  move: (x, y, resolution) => {
    set((state) => (state.drag ? { drag: { ...state.drag, x, y, resolution } } : state));
  },
  end: () => {
    set({ drag: null });
  },
}));

const isOnScreen = (element: Element): boolean => element.getClientRects().length > 0;

/**
 * Resolves the drop for a pointer position: the box under the pointer; or,
 * anywhere else on the tool, the tool's only box on screen.
 */
function resolveDataBlockDrop(x: number, y: number): DropResolution {
  const element = document.elementFromPoint(x, y);
  if (!element) return { kind: 'none' };
  const describe = (id: string): DropResolution => {
    const target = targets.get(id);
    return target
      ? { kind: 'target', id, title: target.title, blockedReason: target.blockedReason }
      : { kind: 'none' };
  };
  const direct = element.closest(`[${DROP_TARGET_ATTRIBUTE}]`)?.getAttribute(DROP_TARGET_ATTRIBUTE);
  if (direct && targets.has(direct)) return describe(direct);
  if (!element.closest(`[${DROP_ZONE_ATTRIBUTE}]`)) return { kind: 'none' };
  const onScreen = [...document.querySelectorAll(`[${DROP_TARGET_ATTRIBUTE}]`)]
    .filter(isOnScreen)
    .map((box) => box.getAttribute(DROP_TARGET_ATTRIBUTE) ?? '')
    .filter((id) => targets.has(id));
  if (onScreen.length === 1 && onScreen[0]) return describe(onScreen[0]);
  return onScreen.length > 1 ? { kind: 'choose-box' } : { kind: 'none' };
}

/** A press on one of these inside a block is that control's, not a drag. */
const CONTROL_SELECTOR = 'button, a, input, textarea, select, [role="menu"], [role="dialog"]';

/**
 * Starts watching a press on a graph Data Block; past the threshold it
 * becomes a drag, and the release drops the block.
 * Called by: CustomNode's pointer-down.
 * Flow: listen on the window for this pointer's moves; once it has travelled
 * the threshold, publish the drag (the chip and the boxes react to the
 * store); on release, add the block to the resolved box, or say why not. The
 * click that follows a drag is swallowed so the block isn't also selected.
 * Escape, a cancelled pointer, or a lost window cancels.
 */
export function startDataBlockDragGesture(
  event: ReactPointerEvent,
  block: { nodeId: string; name: string },
): void {
  if (event.button !== 0 || !event.isPrimary) return;
  if (event.target instanceof Element && event.target.closest(CONTROL_SELECTOR)) return;
  const { pointerId, clientX: startX, clientY: startY } = event;
  const store = useDataBlockDragStore.getState();
  let dragging = false;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;

  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleCancel);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('blur', handleCancel);
    if (dragging) {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      store.end();
    }
  };
  const handleMove = (move: PointerEvent) => {
    if (move.pointerId !== pointerId) return;
    if (!dragging) {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD) return;
      dragging = true;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      store.start({
        ...block,
        x: move.clientX,
        y: move.clientY,
        resolution: resolveDataBlockDrop(move.clientX, move.clientY),
      });
      return;
    }
    move.preventDefault();
    store.move(move.clientX, move.clientY, resolveDataBlockDrop(move.clientX, move.clientY));
  };
  const handleUp = (up: PointerEvent) => {
    if (up.pointerId !== pointerId) return;
    const wasDragging = dragging;
    const resolution = wasDragging ? resolveDataBlockDrop(up.clientX, up.clientY) : null;
    cleanup();
    if (!wasDragging || !resolution) return;
    // The click that ends a drag on the block itself must not select it.
    const swallowClick = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener('click', swallowClick, { capture: true, once: true });
    window.setTimeout(() => {
      window.removeEventListener('click', swallowClick, true);
    }, 0);
    if (resolution.kind === 'target') {
      if (resolution.blockedReason) toast.warning(resolution.blockedReason);
      else targets.get(resolution.id)?.add(block.nodeId);
    } else if (resolution.kind === 'choose-box') {
      toast.info('Drop the Data Block on one of the highlighted boxes.');
    }
  };
  const handleCancel = () => {
    cleanup();
  };
  const handleKeyDown = (key: KeyboardEvent) => {
    if (key.key !== 'Escape' || !dragging) return;
    key.preventDefault();
    key.stopPropagation();
    cleanup();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleCancel);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('blur', handleCancel);
}
