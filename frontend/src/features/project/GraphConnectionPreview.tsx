import { useEffect, useMemo, useState } from 'react';
import {
  getBezierPath,
  Position,
  useInternalNode,
  useReactFlow,
  useViewport,
  ViewportPortal,
} from '@xyflow/react';

/** A temporary logical link, outside the persisted React Flow edge collection. */
export function GraphConnectionPreview({
  anchor,
  outgoing,
}: {
  anchor: string;
  outgoing: boolean;
}) {
  const node = useInternalNode(anchor);
  const flow = useReactFlow();
  const viewport = useViewport();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      setPointer({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
    };
  }, []);
  // The stable React Flow helper reads mutable viewport state. Include the viewport
  // explicitly so React Compiler cannot reuse stale coordinates after zoom/pan.
  const moving = useMemo(
    () => (pointer ? flow.screenToFlowPosition(pointer) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- screenToFlowPosition reads the current viewport through a stable helper.
    [flow, pointer, viewport],
  );
  if (!node || !moving) return null;
  const fixed = {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (outgoing ? (node.measured.height ?? 0) : 0),
  };
  const source = outgoing ? fixed : moving;
  const target = outgoing ? moving : fixed;
  const [path] = getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  });
  return (
    <ViewportPortal>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible"
      >
        <path
          data-testid="logical-connection-preview"
          d={path}
          fill="none"
          stroke="var(--vscode-focusBorder)"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
      </svg>
    </ViewportPortal>
  );
}
