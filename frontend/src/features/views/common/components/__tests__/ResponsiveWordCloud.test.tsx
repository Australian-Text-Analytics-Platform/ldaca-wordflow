import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const chart = {
    on: vi.fn((name: string, _query: string, handler: (event: unknown) => void) =>
      handlers.set(name, handler),
    ),
    off: vi.fn(),
    clear: vi.fn(),
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    handlers,
    chart,
    init: vi.fn((element: HTMLElement) => {
      element.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      return chart;
    }),
    use: vi.fn(),
  };
});

vi.mock('echarts-wordcloud', () => ({}));
vi.mock('echarts/core', () => ({ init: mocks.init, use: mocks.use }));
vi.mock('echarts/renderers', () => ({ SVGRenderer: {} }));

import { ResponsiveWordCloud } from '../ResponsiveWordCloud';
import { wordCloudLayoutSize, wordCloudSizingValue } from '../wordCloudLayoutSize';

describe('ResponsiveWordCloud', () => {
  let measuredWidth = 500;
  let resizeCallback: ResizeObserverCallback | null = null;

  beforeEach(() => {
    measuredWidth = 500;
    resizeCallback = null;
    mocks.handlers.clear();
    mocks.init.mockClear();
    Object.values(mocks.chart).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => measuredWidth);
    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {
        /* Triggered explicitly by the test. */
      }
      unobserve() {
        /* no-op */
      }
      disconnect() {
        /* no-op */
      }
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps words into a deterministic responsive SVG series and exposes it for export', () => {
    // Two short words hit the third-of-height cap, so the smallest font grows.
    const expectedLayout = wordCloudLayoutSize({
      width: 500,
      height: 300,
      words: [
        { text: 'alpha', value: 10 },
        { text: 'beta', value: Math.sqrt(50) },
      ],
    });
    expect(expectedLayout.sizeRange[1]).toBe(100);
    const svgRef = vi.fn();
    const { unmount } = render(
      <ResponsiveWordCloud
        words={[
          { text: 'alpha', value: 100, color: '#ff0000' },
          { text: 'beta', value: 50 },
        ]}
        color="#0000ff"
        minWidth={320}
        minHeight={300}
        aspectRatio={0.5}
        svgRef={svgRef}
        onWordClick={vi.fn()}
      />,
    );

    expect(mocks.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), undefined, {
      renderer: 'svg',
    });
    expect(screen.getByRole('img', { name: 'alpha: 100, beta: 50' })).toHaveStyle({
      width: '500px',
      height: '300px',
    });
    expect(mocks.chart.resize).toHaveBeenCalledWith({ width: 500, height: 300 });
    expect(mocks.chart.clear).toHaveBeenCalledTimes(mocks.chart.setOption.mock.calls.length);
    for (const [index, clearOrder] of mocks.chart.clear.mock.invocationCallOrder.entries()) {
      expect(clearOrder).toBeLessThan(mocks.chart.setOption.mock.invocationCallOrder[index]);
    }
    expect(mocks.chart.setOption).toHaveBeenLastCalledWith(
      {
        animation: false,
        series: [
          expect.objectContaining({
            type: 'wordCloud',
            width: '100%',
            height: '100%',
            shape: 'square',
            keepAspect: false,
            sizeRange: expectedLayout.sizeRange,
            rotationRange: [0, 0],
            gridSize: expectedLayout.gridSize,
            drawOutOfBound: false,
            shrinkToFit: true,
            layoutAnimation: false,
            silent: false,
            data: [
              expect.objectContaining({
                name: 'alpha',
                value: 10,
                textStyle: { color: '#ff0000' },
              }),
              expect.objectContaining({
                name: 'beta',
                value: Math.sqrt(50),
                textStyle: { color: '#0000ff' },
              }),
            ],
          }),
        ],
      },
      { notMerge: true, lazyUpdate: false },
    );
    expect(svgRef).toHaveBeenLastCalledWith(expect.any(SVGSVGElement));

    measuredWidth = 700;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.chart.clear).toHaveBeenCalledTimes(mocks.chart.setOption.mock.calls.length);
    expect(mocks.chart.resize).toHaveBeenLastCalledWith({ width: 700, height: 350 });

    unmount();
    expect(svgRef).toHaveBeenLastCalledWith(null);
    expect(mocks.chart.dispose).toHaveBeenCalledOnce();
  });

  it('forwards word events to the latest callbacks and suppresses the native context menu', () => {
    const firstClick = vi.fn();
    const firstContextMenu = vi.fn();
    const { rerender } = render(
      <ResponsiveWordCloud
        words={[{ text: 'alpha', value: 10 }]}
        onWordClick={firstClick}
        onWordContextMenu={firstContextMenu}
      />,
    );

    act(() => {
      mocks.handlers.get('click')?.({ name: 'alpha' });
      mocks.handlers.get('contextmenu')?.({ name: 'alpha' });
    });
    expect(firstClick).toHaveBeenCalledWith('alpha');
    expect(firstContextMenu).toHaveBeenCalledWith('alpha');

    const nativeEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    screen.getByRole('img').dispatchEvent(nativeEvent);
    expect(nativeEvent.defaultPrevented).toBe(true);

    const nextClick = vi.fn();
    const nextContextMenu = vi.fn();
    rerender(
      <ResponsiveWordCloud
        words={[{ text: 'alpha', value: 10 }]}
        onWordClick={nextClick}
        onWordContextMenu={nextContextMenu}
      />,
    );
    act(() => {
      mocks.handlers.get('click')?.({ name: 'alpha' });
      mocks.handlers.get('contextmenu')?.({ name: 'alpha' });
    });
    expect(nextClick).toHaveBeenCalledWith('alpha');
    expect(nextContextMenu).toHaveBeenCalledWith('alpha');
    expect(mocks.chart.on).toHaveBeenCalledTimes(2);
  });

  it('suppresses the native context menu even when the word is detached mid-event', () => {
    const { rerender } = render(
      <ResponsiveWordCloud words={[{ text: 'alpha', value: 1 }]} onWordContextMenu={vi.fn()} />,
    );
    const plot = screen.getByRole('img');
    // Stand-in for an SVG word that zrender's listener removes when the stop
    // word update re-renders the cloud before the event finishes bubbling.
    const word = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    plot.appendChild(word);
    word.addEventListener('contextmenu', () => {
      word.remove();
    });

    const detachedEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    word.dispatchEvent(detachedEvent);
    expect(detachedEvent.defaultPrevented).toBe(true);

    rerender(<ResponsiveWordCloud words={[{ text: 'alpha', value: 1 }]} />);
    const plainEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    plot.dispatchEvent(plainEvent);
    expect(plainEvent.defaultPrevented).toBe(false);
  });

  it('compresses counts with a square root before sizing', () => {
    expect(wordCloudSizingValue(10_000)).toBe(100);
    expect(wordCloudSizingValue(-1)).toBe(0);
  });

  it('fills the pane from the words while capping the largest word', () => {
    const cloud = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        text: `word${String(index)}`,
        value: wordCloudSizingValue(1000 / (index + 1)),
      }));
    const many = wordCloudLayoutSize({ width: 1000, height: 600, words: cloud(100) });
    const few = wordCloudLayoutSize({ width: 1000, height: 600, words: cloud(30) });
    const wide = wordCloudLayoutSize({ width: 1600, height: 960, words: cloud(100) });

    // The largest word never exceeds a third of the height.
    expect(many.sizeRange[1]).toBeLessThanOrEqual(200);
    // A short list hits the cap and grows its smallest words instead.
    expect(few.sizeRange[1]).toBe(200);
    expect(few.sizeRange[0]).toBeGreaterThan(many.sizeRange[0]);
    // Growing the pane grows the words, and spacing follows the largest font.
    expect(wide.sizeRange[1]).toBeGreaterThan(many.sizeRange[1]);
    expect(wide.gridSize).toBeGreaterThanOrEqual(many.gridSize);
  });

  it('keeps small clouds legible', () => {
    const layout = wordCloudLayoutSize({
      width: 180,
      height: 86,
      words: Array.from({ length: 30 }, (_, index) => ({ text: 'representative', value: index })),
    });
    expect(layout.sizeRange).toEqual([10, 24]);
    expect(layout.gridSize).toBe(4);
  });
});
