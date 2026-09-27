import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBuildBuilderDrag } from '../useBuildBuilderDrag';
import type { BuildBuilderToken } from '../buildExpressionModel';
import { findExpression, moveExpression } from '../../expressionTree';
const leaf: BuildBuilderToken = { id: 'a', kind: 'column', column: 'a', operations: [] };
const child: BuildBuilderToken = {
  id: 'child',
  kind: 'combination',
  combination: null,
  children: [leaf],
  operations: [],
};
const parent: BuildBuilderToken = {
  id: 'parent',
  kind: 'combination',
  combination: null,
  children: [child],
  operations: [],
};
const roots = [parent, { ...leaf, id: 'b' }];
afterEach(() => vi.restoreAllMocks());
function event(x = 0, y = 0) {
  return {
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: y,
    currentTarget: Object.assign(document.createElement('button'), { setPointerCapture: vi.fn() }),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLElement>;
}
function pointAt(parent: string | null, index: number) {
  const target = document.createElement('span');
  target.dataset.buildDrop = JSON.stringify({ parent, index });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => target),
  });
}
it('copies palette columns to an exact nested slot and releases ownership', () => {
  const copy = vi.fn(),
    move = vi.fn();
  const { result } = renderHook(() => useBuildBuilderDrag(roots, copy, move));
  const value = { kind: 'column' as const, column: 'a' };
  act(() => result.current.source(value).onPointerDown(event()));
  pointAt('child', 1);
  act(() => result.current.source(value).onPointerMove(event(20)));
  expect(result.current.over).toEqual({ parent: 'child', index: 1 });
  act(() => result.current.source(value).onPointerUp(event(20)));
  expect(copy).toHaveBeenCalledWith('a', { parent: 'child', index: 1 });
  expect(move).not.toHaveBeenCalled();
  expect(result.current.dragged).toBeNull();
});
it('rejects descendant drops and releases cancelled or lost pointer capture', () => {
  const move = vi.fn();
  const { result } = renderHook(() => useBuildBuilderDrag(roots, vi.fn(), move));
  const value = { kind: 'expression' as const, id: 'parent' };
  for (const parent of ['parent', 'child']) {
    act(() => result.current.source(value).onPointerDown(event()));
    pointAt(parent, 0);
    act(() => result.current.source(value).onPointerMove(event(20)));
    expect(result.current.over).toBeNull();
    act(() => result.current.source(value).onPointerUp(event(20)));
  }
  expect(move).not.toHaveBeenCalled();
  for (const end of ['onPointerCancel', 'onLostPointerCapture'] as const) {
    act(() => result.current.source(value).onPointerDown(event()));
    pointAt(null, 2);
    act(() => result.current.source(value).onPointerMove(event(20)));
    act(() => result.current.source(value)[end]());
    expect(result.current.over).toBeNull();
    expect(result.current.dragged).toBeNull();
    act(() => result.current.source(value).onPointerUp(event(20)));
    expect(move).not.toHaveBeenCalled();
  }
});
it('keeps clicks as clicks until the drag threshold is crossed', () => {
  const copy = vi.fn();
  const { result } = renderHook(() => useBuildBuilderDrag(roots, copy, vi.fn()));
  const value = { kind: 'column' as const, column: 'a' };
  act(() => result.current.source(value).onPointerDown(event()));
  pointAt(null, 0);
  act(() => result.current.source(value).onPointerMove(event(2)));
  act(() => result.current.source(value).onPointerUp(event(2)));
  expect(copy).not.toHaveBeenCalled();
});
it('moves whole subtrees, adjusts same-parent indices and prevents cycles in keyboard moves', () => {
  const moved = moveExpression(roots, 'child', null, 2);
  expect(moved.map((node) => node.id)).toEqual(['parent', 'b', 'child']);
  expect(findExpression(moved, 'child')).toEqual(child);
  expect(moveExpression(roots, 'parent', 'child', 0)).toBe(roots);
  expect(moveExpression(roots, 'parent', 'parent', 0)).toBe(roots);
  expect(moveExpression(roots, 'parent', null, 2).map((node) => node.id)).toEqual(['b', 'parent']);
});

it('keeps the pickup offset, ignores outside drops and cancels without moving', () => {
  const move = vi.fn();
  const { result } = renderHook(() => useBuildBuilderDrag(roots, vi.fn(), move));
  const value = { kind: 'expression' as const, id: 'b' };
  const down = event(12, 18);
  vi.spyOn(down.currentTarget, 'getBoundingClientRect').mockReturnValue({
    left: 5,
    top: 10,
  } as DOMRect);
  act(() => result.current.source(value).onPointerDown(down));
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  act(() => result.current.source(value).onPointerMove(event(40, 60)));
  expect(result.current.preview).toEqual({ x: 33, y: 52 });
  expect(result.current.over).toBeNull();
  act(() => result.current.source(value).onPointerUp(event(40, 60)));
  expect(move).not.toHaveBeenCalled();
  expect(result.current.preview).toBeNull();
});
