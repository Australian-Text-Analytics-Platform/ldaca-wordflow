import { useRef, useState, type PointerEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { findExpression } from '../expressionTree';
import type { BuildBuilderToken } from './buildExpressionModel';

type Dragged = { kind: 'column'; column: string } | { kind: 'expression'; id: string };
interface Destination {
  parent: string | null;
  index: number;
}
export function useBuildBuilderDrag(
  roots: BuildBuilderToken[],
  onColumn: (column: string, destination: Destination) => void,
  onMove: (id: string, destination: Destination) => void,
) {
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [over, setOver] = useState<Destination | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pointer = useRef<{
    value: Dragged;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const keyboard = useRef<{ value: Dragged; slots: HTMLElement[]; index: number } | null>(null);
  const suppressClick = useRef(false);
  const end = () => {
    pointer.current = null;
    keyboard.current = null;
    setDragged(null);
    setOver(null);
    setPreview(null);
  };
  const valid = (value: Destination, moving: Dragged) => {
    if (moving.kind !== 'expression' || value.parent === null) return true;
    const expression = findExpression(roots, moving.id);
    return Boolean(expression && !findExpression([expression], value.parent));
  };
  const readTarget = (target: HTMLElement): Destination =>
    JSON.parse(target.dataset.buildDrop ?? 'null') as Destination;
  const destination = (event: PointerEvent): Destination | null => {
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-build-drop]');
    if (!target || !pointer.current) return null;
    const value = readTarget(target);
    if (!valid(value, pointer.current.value)) return null;
    if (target.dataset.buildLeaf) {
      const bounds = target.getBoundingClientRect();
      value.index += event.clientX > bounds.left + bounds.width / 2 ? 1 : 0;
    }
    return value;
  };
  const drop = (value: Dragged, target: Destination) => {
    if (value.kind === 'column') onColumn(value.column, target);
    else onMove(value.id, target);
    setAnnouncement('Expression dropped.');
  };
  const showKeyboardTarget = () => {
    const active = keyboard.current;
    const slot = active?.slots[active.index];
    if (!slot) return;
    setOver(readTarget(slot));
    setAnnouncement(
      `${slot.dataset.dropDescription ?? 'Insertion position'}. Enter to drop, Escape to cancel.`,
    );
    slot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return {
    dragged,
    over,
    preview,
    announcement,
    target: (value: Destination) => ({ 'data-build-drop': JSON.stringify(value) }),
    // Pointer capture keeps internal dragging independent of Tauri's native file-drop handler.
    source: (value: Dragged) => ({
      draggable: false,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        suppressClick.current = false;
        const bubble =
          event.currentTarget.closest<HTMLElement>('[data-expression-id]') ?? event.currentTarget;
        const bounds = bubble.getBoundingClientRect();
        pointer.current = {
          value,
          x: event.clientX,
          y: event.clientY,
          offsetX: event.clientX - bounds.left,
          offsetY: event.clientY - bounds.top,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const active = pointer.current;
        if (!active) return;
        if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5)
          return;
        event.preventDefault();
        active.moved = true;
        suppressClick.current = true;
        setDragged(active.value);
        setPreview({ x: event.clientX - active.offsetX, y: event.clientY - active.offsetY });
        setOver(destination(event));
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const active = pointer.current;
        const target = active?.moved ? destination(event) : null;
        if (target && active) drop(active.value, target);
        end();
      },
      onPointerCancel: end,
      onLostPointerCapture: () => {
        if (pointer.current) end();
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape' && (pointer.current || keyboard.current)) {
          event.preventDefault();
          event.stopPropagation();
          end();
          setAnnouncement('Move cancelled.');
          return;
        }
        if (value.kind !== 'expression') return;
        if (event.key === ' ' && !keyboard.current) {
          event.preventDefault();
          const scope = event.currentTarget.closest('[aria-label="Expression builder"]');
          const slots = Array.from(
            scope?.querySelectorAll<HTMLElement>('[data-drop-index]') ?? [],
          ).filter((slot) => valid(readTarget(slot), value));
          if (!slots.length) return;
          const bubble = event.currentTarget.closest('[data-expression-id]');
          const ownSlot = bubble?.parentElement?.querySelector('[data-drop-index]');
          keyboard.current = {
            value,
            slots,
            index: Math.max(
              0,
              slots.findIndex((slot) => slot === ownSlot),
            ),
          };
          setDragged(value);
          showKeyboardTarget();
        } else if (
          keyboard.current &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
        ) {
          event.preventDefault();
          const active = keyboard.current;
          const delta = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
          active.index = Math.max(0, Math.min(active.slots.length - 1, active.index + delta));
          showKeyboardTarget();
        } else if (keyboard.current && event.key === 'Enter') {
          event.preventDefault();
          const active = keyboard.current;
          const slot = active.slots[active.index];
          if (slot) drop(active.value, readTarget(slot));
          const scope = event.currentTarget.closest('[aria-label="Expression builder"]');
          end();
          requestAnimationFrame(() => {
            scope
              ?.querySelector<HTMLElement>(`[data-expression-id="${value.id}"] [data-drag-handle]`)
              ?.focus();
          });
        }
      },
      onClickCapture: (event: MouseEvent) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
    }),
  };
}
