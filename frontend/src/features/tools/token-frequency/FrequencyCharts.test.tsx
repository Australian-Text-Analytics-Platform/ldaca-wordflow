import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let width = 0;
  const handlers = new Map<string, (event: { name?: string }) => void>();
  const chart = {
    on: vi.fn((name: string, _query: string, handler: (event: { name?: string }) => void) =>
      handlers.set(name, handler),
    ),
    off: vi.fn(),
    clear: vi.fn(),
    setOption: vi.fn(),
    resize: vi.fn((dimensions: { width: number }) => {
      width = dimensions.width;
    }),
    getWidth: vi.fn(() => width),
    dispose: vi.fn(),
  };
  return {
    handlers,
    chart,
    init: vi.fn((element: HTMLElement) => {
      element.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      return chart;
    }),
  };
});

vi.mock('echarts-wordcloud', () => ({}));
vi.mock('echarts/core', () => ({ init: mocks.init, use: vi.fn() }));
vi.mock('echarts/renderers', () => ({ SVGRenderer: {} }));

import { FrequencyCorpusCloud, FrequencyJuxtorpusCloud } from './FrequencyCharts';

describe('FrequencyCharts', () => {
  let measuredWidth = 500;
  let resizeCallback: ResizeObserverCallback | undefined;
  const disconnect = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach((callback) => callback(0)));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    measuredWidth = 500;
    frames.clear();
    frameId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++frameId, callback);
        return frameId;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        frames.delete(id);
      }),
    );
    mocks.handlers.clear();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => measuredWidth);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {
          // Tests deliver resize notifications explicitly.
        }
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders per-word colours in responsive SVG and clears obsolete layouts', () => {
    const svgRef = vi.fn();
    const { rerender, unmount } = render(
      <FrequencyJuxtorpusCloud
        label="Corpus cloud"
        referenceColor="#dc2626"
        studyColor="#2563eb"
        rows={[
          {
            token: 'alpha',
            freq_corpus_0: 100,
            freq_corpus_1: 0,
            percent_corpus_0: 1,
            percent_corpus_1: 0,
          },
          {
            token: 'beta',
            freq_corpus_0: 0,
            freq_corpus_1: 50,
            percent_corpus_0: 0,
            percent_corpus_1: 1,
          },
        ]}
        svgRef={svgRef}
      />,
    );
    expect(mocks.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), undefined, {
      renderer: 'svg',
    });
    expect(screen.getByRole('img', { name: 'Corpus cloud: alpha: 100, beta: 50' })).toHaveStyle({
      height: '300px',
    });
    expect(mocks.chart.setOption).toHaveBeenLastCalledWith(
      {
        animation: false,
        series: [
          expect.objectContaining({
            type: 'wordCloud',
            rotationRange: [0, 0],
            shrinkToFit: true,
            layoutAnimation: false,
            silent: true,
            data: [
              { name: 'alpha', value: 100, textStyle: { color: '#dc2626' } },
              { name: 'beta', value: 50, textStyle: { color: '#2563eb' } },
            ],
          }),
        ],
      },
      { notMerge: true, lazyUpdate: false },
    );
    expect(svgRef).toHaveBeenLastCalledWith(expect.any(SVGSVGElement));

    measuredWidth = 240;
    act(() => resizeCallback?.([], {} as ResizeObserver));
    flushFrames();
    expect(mocks.chart.resize).toHaveBeenLastCalledWith({ width: 240, height: 180 });
    rerender(
      <FrequencyJuxtorpusCloud
        label="Corpus cloud"
        referenceColor="#dc2626"
        studyColor="#2563eb"
        rows={[
          {
            token: 'new result',
            freq_corpus_0: 10,
            freq_corpus_1: 0,
            percent_corpus_0: 1,
            percent_corpus_1: 0,
          },
        ]}
        svgRef={svgRef}
      />,
    );
    expect(screen.getByRole('img', { name: 'Corpus cloud: new result: 10' })).toBeInTheDocument();
    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.chart.clear).toHaveBeenCalledTimes(mocks.chart.setOption.mock.calls.length);
    for (const [index, clearOrder] of mocks.chart.clear.mock.invocationCallOrder.entries()) {
      expect(clearOrder).toBeLessThan(mocks.chart.setOption.mock.invocationCallOrder[index]);
    }
    unmount();
    expect(svgRef).toHaveBeenLastCalledWith(null);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(mocks.chart.dispose).toHaveBeenCalledOnce();
  });

  it('coalesces resize delivery into a frame and cancels pending drawing on unmount', () => {
    const { unmount } = render(<FrequencyCorpusCloud label="Cloud" rows={[]} />);
    expect(mocks.chart.resize).toHaveBeenCalledOnce();
    measuredWidth = 400;
    act(() => resizeCallback?.([], {} as ResizeObserver));
    measuredWidth = 300;
    act(() => resizeCallback?.([], {} as ResizeObserver));
    expect(mocks.chart.resize).toHaveBeenCalledOnce();
    expect(screen.getByRole('img')).toHaveStyle({ height: '300px' });
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    flushFrames();
    expect(mocks.chart.resize).toHaveBeenCalledTimes(2);
    expect(mocks.chart.resize).toHaveBeenLastCalledWith({ width: 300, height: 180 });

    act(() => resizeCallback?.([], {} as ResizeObserver));
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    measuredWidth = 200;
    act(() => resizeCallback?.([], {} as ResizeObserver));
    expect(frames.size).toBe(1);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(frames.size).toBe(0);
    flushFrames();
    expect(mocks.chart.resize).toHaveBeenCalledTimes(2);
    expect(mocks.chart.dispose).toHaveBeenCalledOnce();
  });

  it('retains the layout for cached rows and new callback owners but draws changed content', () => {
    const firstRef = vi.fn();
    const nextRef = vi.fn();
    const firstAction = vi.fn();
    const nextAction = vi.fn();
    const props = {
      label: 'Cloud',
      color: '#2563eb',
      rows: [{ token: 'alpha', frequency: 10n }],
    };
    const { rerender, unmount } = render(
      <FrequencyCorpusCloud {...props} svgRef={firstRef} onTokenContextMenu={firstAction} />,
    );
    rerender(
      <FrequencyCorpusCloud
        {...props}
        rows={props.rows}
        svgRef={nextRef}
        onTokenContextMenu={nextAction}
      />,
    );
    expect(mocks.chart.clear).toHaveBeenCalledOnce();
    expect(mocks.chart.setOption).toHaveBeenCalledOnce();
    expect(firstRef).toHaveBeenLastCalledWith(null);
    expect(nextRef).toHaveBeenLastCalledWith(expect.any(SVGSVGElement));
    act(() => mocks.handlers.get('contextmenu')?.({ name: 'alpha' }));
    expect(nextAction).toHaveBeenCalledExactlyOnceWith('alpha');
    expect(firstAction).not.toHaveBeenCalled();

    for (const words of [
      [{ token: 'alpha', frequency: 20n }],
      [{ token: 'beta', frequency: 20n }],
      [],
    ]) {
      rerender(
        <FrequencyCorpusCloud
          {...props}
          rows={words}
          svgRef={nextRef}
          onTokenContextMenu={nextAction}
        />,
      );
    }
    expect(mocks.chart.setOption).toHaveBeenCalledTimes(4);
    unmount();
    expect(nextRef).toHaveBeenLastCalledWith(null);
  });

  it('routes context actions and Concordance clicks to the current owner', () => {
    const first = vi.fn();
    const next = vi.fn();
    const words = [{ token: 'alpha', frequency: 10 }];
    const { rerender } = render(
      <FrequencyCorpusCloud label="Cloud" rows={words} onTokenContextMenu={first} />,
    );
    act(() => mocks.handlers.get('contextmenu')?.({ name: 'alpha' }));
    expect(first).toHaveBeenCalledExactlyOnceWith('alpha');
    expect(fireEvent.contextMenu(screen.getByRole('img'))).toBe(false);
    rerender(<FrequencyCorpusCloud label="Cloud" rows={words} onTokenContextMenu={next} />);
    act(() => mocks.handlers.get('contextmenu')?.({ name: 'alpha' }));
    expect(next).toHaveBeenCalledExactlyOnceWith('alpha');
    const navigate = vi.fn();
    rerender(
      <FrequencyCorpusCloud
        label="Cloud"
        rows={words}
        onTokenContextMenu={next}
        onTokenClick={navigate}
      />,
    );
    act(() => mocks.handlers.get('click')?.({ name: 'alpha' }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith('alpha');
    expect(mocks.chart.on).toHaveBeenCalledTimes(2);
  });

  it('labels an empty cloud without fabricating token data', () => {
    render(<FrequencyCorpusCloud label="Corpus cloud" rows={[]} />);
    expect(
      screen.getByRole('img', { name: 'Corpus cloud: No matching tokens' }),
    ).toBeInTheDocument();
    expect(fireEvent.contextMenu(screen.getByRole('img'))).toBe(true);
  });
});
