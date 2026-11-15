import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import {
  DROP_TARGET_ATTRIBUTE,
  DROP_ZONE_ATTRIBUTE,
  registerDataBlockDropTarget,
  startDataBlockDragGesture,
  useDataBlockDragStore,
} from '../dataBlockDragStore';

const block = { nodeId: 'node-1', name: 'tweets' };
let underPointer: Element | null = null;
const cleanups: (() => void)[] = [];

const pointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  window.dispatchEvent(event);
};

const press = (target: Element = document.body) => {
  startDataBlockDragGesture(
    {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      target,
    } as unknown as ReactPointerEvent,
    block,
  );
};

/** An inputs box on screen, registered as a drop target. */
const addBox = (id: string, options: { blockedReason?: string } = {}) => {
  const zone = document.querySelector(`[${DROP_ZONE_ATTRIBUTE}]`);
  const box = document.createElement('div');
  box.setAttribute(DROP_TARGET_ATTRIBUTE, id);
  box.getClientRects = () => [{ width: 10, height: 10 }] as unknown as DOMRectList;
  zone?.append(box);
  const add = vi.fn();
  cleanups.push(registerDataBlockDropTarget(id, { title: `Box ${id}`, add, ...options }));
  return { box, add };
};

describe('dragging a Data Block from the graph (Chao, 15 Nov 2026)', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div ${DROP_ZONE_ATTRIBUTE}=""><p id="elsewhere">tool</p></div><aside id="graph"></aside>`;
    document.elementFromPoint = () => underPointer;
    underPointer = null;
    toastMocks.warning.mockReset();
    toastMocks.info.mockReset();
  });
  afterEach(() => {
    pointer('pointerup', 0, 0);
    cleanups.splice(0).forEach((cleanup) => {
      cleanup();
    });
    useDataBlockDragStore.setState({ drag: null });
  });

  it('stays a click until the pointer has travelled a little', () => {
    const { box, add } = addBox('a');
    underPointer = box;
    press();
    pointer('pointermove', 3, 3);
    expect(useDataBlockDragStore.getState().drag).toBeNull();
    pointer('pointerup', 3, 3);
    expect(add).not.toHaveBeenCalled();
  });

  it('adds the block to the box it is released on', () => {
    const { box, add } = addBox('a');
    press();
    pointer('pointermove', 20, 0);
    expect(useDataBlockDragStore.getState().drag).toMatchObject({
      nodeId: 'node-1',
      name: 'tweets',
      resolution: { kind: 'none' },
    });
    underPointer = box;
    pointer('pointermove', 40, 0);
    expect(useDataBlockDragStore.getState().drag?.resolution).toEqual({
      kind: 'target',
      id: 'a',
      title: 'Box a',
      blockedReason: undefined,
    });
    pointer('pointerup', 40, 0);
    expect(add).toHaveBeenCalledWith('node-1');
    expect(useDataBlockDragStore.getState().drag).toBeNull();
  });

  it('uses the tool’s only box when released elsewhere on the tool, and asks to choose when there are several', () => {
    const first = addBox('a');
    underPointer = document.getElementById('elsewhere');
    press();
    pointer('pointermove', 20, 0);
    pointer('pointerup', 20, 0);
    expect(first.add).toHaveBeenCalledWith('node-1');

    const second = addBox('b');
    press();
    pointer('pointermove', 20, 0);
    expect(useDataBlockDragStore.getState().drag?.resolution).toEqual({ kind: 'choose-box' });
    pointer('pointerup', 20, 0);
    expect(first.add).toHaveBeenCalledTimes(1);
    expect(second.add).not.toHaveBeenCalled();
    expect(toastMocks.info).toHaveBeenCalledWith(
      'Drop the Data Block on one of the highlighted boxes.',
    );
  });

  it('does nothing when released outside the tool, such as back on the graph', () => {
    const { add } = addBox('a');
    underPointer = document.getElementById('graph');
    press();
    pointer('pointermove', 20, 0);
    pointer('pointerup', 20, 0);
    expect(add).not.toHaveBeenCalled();
    expect(toastMocks.info).not.toHaveBeenCalled();
  });

  it('says why a full box refuses the block', () => {
    const { box, add } = addBox('a', { blockedReason: 'Data Blocks is already full.' });
    underPointer = box;
    press();
    pointer('pointermove', 20, 0);
    pointer('pointerup', 20, 0);
    expect(add).not.toHaveBeenCalled();
    expect(toastMocks.warning).toHaveBeenCalledWith('Data Blocks is already full.');
  });

  it('cancels on Escape, and leaves presses on a block’s own controls alone', () => {
    const { box, add } = addBox('a');
    underPointer = box;
    press();
    pointer('pointermove', 20, 0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(useDataBlockDragStore.getState().drag).toBeNull();
    pointer('pointerup', 20, 0);
    expect(add).not.toHaveBeenCalled();

    const button = document.createElement('button');
    document.body.append(button);
    press(button);
    pointer('pointermove', 20, 0);
    expect(useDataBlockDragStore.getState().drag).toBeNull();
  });
});
