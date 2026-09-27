import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { GraphConnectionPreview } from './GraphConnectionPreview';

const flow = vi.hoisted(() => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  screenToFlowPosition: vi.fn((point: { x: number; y: number }) => ({ x: point.x, y: point.y })),
}));
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom' },
  getBezierPath: () => ['M0 0'],
  useViewport: () => flow.viewport,
  useReactFlow: () => flow,
  useInternalNode: () => ({
    internals: { positionAbsolute: { x: 0, y: 0 } },
    measured: { width: 100, height: 50 },
  }),
  ViewportPortal: ({ children }: { children: React.ReactNode }) => children,
}));
it('reprojects the pointer when the viewport changes without a new pointer event', () => {
  const view = render(<GraphConnectionPreview anchor="source" outgoing />);
  act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 80 })));
  expect(flow.screenToFlowPosition).toHaveBeenCalledExactlyOnceWith({ x: 100, y: 80 });
  flow.viewport = { x: 10, y: 20, zoom: 2 };
  view.rerender(<GraphConnectionPreview anchor="source" outgoing />);
  expect(flow.screenToFlowPosition).toHaveBeenCalledTimes(2);
});
