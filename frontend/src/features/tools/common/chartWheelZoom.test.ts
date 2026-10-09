import { expect, it, vi } from 'vite-plus/test';
import type { EChartsType } from 'echarts/core';
import { chartWheelZoom } from './chartWheelZoom';

it('leaves plain wheel scrolling alone and zooms only with Cmd/Ctrl, then removes its listener', () => {
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);
  const dispatchAction = vi.fn();
  const chart = {
    getOption: () => ({
      dataZoom: [
        { type: 'inside', start: 20, end: 80 },
        { type: 'slider', start: 20, end: 80 },
      ],
    }),
    dispatchAction,
  } as unknown as EChartsType;
  const remove = chartWheelZoom(element, chart);
  const plain = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
  element.dispatchEvent(plain);
  expect(plain.defaultPrevented).toBe(false);
  expect(dispatchAction).not.toHaveBeenCalled();
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const event = new WheelEvent('wheel', {
      [modifier]: true,
      deltaY: -100,
      clientX: 100,
      cancelable: true,
    });
    element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const action = dispatchAction.mock.lastCall?.[0];
    expect(action.batch).toHaveLength(1);
    expect(action.batch[0].dataZoomIndex).toBe(0);
    expect(action.batch[0].end - action.batch[0].start).toBeLessThan(60);
  }
  remove();
  dispatchAction.mockClear();
  element.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100 }));
  expect(dispatchAction).not.toHaveBeenCalled();
});
