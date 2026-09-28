import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const zrHandlers = new Map<string, (event: unknown) => void>();
  const chart = {
    on: vi.fn((name: string, handler: (event: unknown) => void) => handlers.set(name, handler)),
    off: vi.fn(),
    setOption: vi.fn(),
    clear: vi.fn(),
    dispatchAction: vi.fn(),
    containPixel: vi.fn(() => true),
    resize: vi.fn(),
    dispose: vi.fn(),
    getZr: vi.fn(() => ({
      on: vi.fn((name: string, handler: (event: unknown) => void) => zrHandlers.set(name, handler)),
      off: vi.fn(),
    })),
  };
  return {
    handlers,
    zrHandlers,
    chart,
    init: vi.fn(() => chart),
    use: vi.fn(),
  };
});

vi.mock('echarts/core', () => ({ init: mocks.init, use: mocks.use }));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({
  AriaComponent: {},
  DataZoomComponent: {},
  DatasetComponent: {},
  GridComponent: {},
  MarkAreaComponent: {},
  TooltipComponent: {},
  VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ SVGRenderer: {} }));

import { EChartsView } from '../EChartsView';

describe('EChartsView', () => {
  const resizeCallbacks: ResizeObserverCallback[] = [];

  beforeEach(() => {
    mocks.handlers.clear();
    mocks.zrHandlers.clear();
    mocks.init.mockClear();
    Object.values(mocks.chart).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    });
    resizeCallbacks.length = 0;
    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
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
    vi.unstubAllGlobals();
  });

  it('initializes one SVG chart, updates options, resizes, and disposes', () => {
    const { rerender, unmount } = render(
      <EChartsView
        option={{ series: [] }}
        height={240}
        pointCount={2}
        dataResetKey="result-a"
        ariaLabel="Test chart"
        toolbarStart={<button type="button">Download chart</button>}
      />,
    );

    expect(
      within(screen.getByRole('generic', { name: 'Chart controls' })).getByRole('button', {
        name: 'Download chart',
      }),
    ).toBeInTheDocument();

    expect(mocks.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), undefined, {
      renderer: 'svg',
    });
    expect(mocks.chart.setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        aria: expect.objectContaining({ enabled: true, description: 'Test chart' }),
        dataZoom: expect.arrayContaining([
          expect.objectContaining({ type: 'inside', moveOnMouseMove: false }),
          expect.objectContaining({ type: 'slider' }),
        ]),
      }),
      { notMerge: true, lazyUpdate: false },
    );

    rerender(
      <EChartsView
        option={{ series: [{ type: 'line' }] }}
        height={240}
        pointCount={2}
        dataResetKey="result-a"
        ariaLabel="Updated chart"
        toolbarStart={<button type="button">Download chart</button>}
      />,
    );
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.chart.setOption).toHaveBeenLastCalledWith(
      expect.objectContaining({ series: [{ type: 'line' }] }),
      { notMerge: true, lazyUpdate: false },
    );

    act(() => {
      resizeCallbacks[0]?.([], {} as ResizeObserver);
    });
    expect(mocks.chart.resize).toHaveBeenCalled();
    unmount();
    expect(mocks.chart.dispose).toHaveBeenCalledOnce();
  });

  it('maps plot clicks, with Shift, to complete dataset indices and shows the hint (issue 224)', () => {
    const onSelect = vi.fn();
    render(
      <EChartsView
        option={{ series: [{ type: 'line' }] }}
        height={240}
        pointCount={6}
        dataResetKey="result-a"
        ariaLabel="Selectable chart"
        onSelect={onSelect}
        getPointSummary={(index) => `Point summary ${String(index)}`}
        selectionHint="Shift-click another point to select the points between."
      />,
    );

    act(() => {
      mocks.handlers.get('showtip')?.({ dataIndex: 3 });
      mocks.zrHandlers.get('click')?.({ offsetX: 120, offsetY: 80, event: { shiftKey: true } });
    });
    expect(onSelect).toHaveBeenCalledWith(3, true);
    expect(screen.getByText('Point summary 3')).toBeInTheDocument();
    expect(mocks.chart.containPixel).toHaveBeenCalledWith({ gridIndex: 0 }, [120, 80]);
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({
      type: 'updateAxisPointer',
      x: 120,
      y: 80,
    });
    // The Select range button and its brush are gone (issue 224).
    expect(screen.queryByRole('button', { name: 'Select range' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Shift-click another point to select the points between.'),
    ).toBeInTheDocument();
    expect(mocks.handlers.has('brushselected')).toBe(false);
  });

  it('supports keyboard point navigation and accessible zoom controls', () => {
    const onSelect = vi.fn();
    render(
      <EChartsView
        option={{ series: [{ type: 'line' }] }}
        height={240}
        pointCount={3}
        dataResetKey="result-a"
        ariaLabel="Keyboard chart"
        onSelect={onSelect}
        getPointSummary={(index) => `Point ${String(index + 1)} details`}
      />,
    );

    const chart = screen.getByRole('group', { name: 'Keyboard chart' });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    fireEvent.keyDown(chart, { key: 'Enter', shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith(1, true);
    expect(screen.getByText('Point 2 details')).toBeInTheDocument();
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toBeEnabled();
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dataZoom', dataZoomId: 'wordflow-inside-zoom' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByText('Chart zoom reset')).toBeInTheDocument();
  });

  it('re-inserts clip paths after each render so Safari repaints clipped lines (issue 213)', () => {
    render(
      <EChartsView
        height={200}
        pointCount={3}
        dataResetKey="result-1"
        ariaLabel="Trends chart"
        option={{ series: [{ id: 'a', type: 'line' }] }}
      />,
    );
    const plot = mocks.init.mock.calls[0]?.[0] as unknown as HTMLElement;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    const after = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    defs.append(clip, after);
    plot.append(defs);
    const insertBefore = vi.spyOn(defs, 'insertBefore');

    act(() => {
      mocks.handlers.get('rendered')?.({});
    });

    expect(insertBefore).toHaveBeenCalledWith(clip, after);
    expect(defs.contains(clip)).toBe(true);
  });

  it('keeps plain wheel events away from ECharts so the pane scrolls (issue 215)', () => {
    render(
      <EChartsView
        height={200}
        pointCount={3}
        dataResetKey="result-1"
        ariaLabel="Trends chart"
        option={{ series: [] }}
      />,
    );
    const plot = mocks.init.mock.calls[0]?.[0] as unknown as HTMLElement;
    const surface = document.createElement('div');
    plot.append(surface);
    const reached = vi.fn();
    surface.addEventListener('wheel', reached);

    fireEvent.wheel(surface, { deltaY: 100 });
    expect(reached).not.toHaveBeenCalled();

    // jsdom is not macOS, so Ctrl is the zoom key.
    fireEvent.wheel(surface, { deltaY: 100, ctrlKey: true });
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('zooms on the wheel only with Ctrl or Cmd held and styles the zoom slider (issues 213, 215)', () => {
    render(
      <EChartsView
        height={200}
        pointCount={3}
        dataResetKey="result-1"
        ariaLabel="Trends chart"
        option={{ series: [] }}
      />,
    );
    const option = mocks.chart.setOption.mock.calls.at(-1)?.[0] as {
      dataZoom: { id: string; zoomOnMouseWheel?: boolean | string; fillerColor?: string }[];
    };
    const inside = option.dataZoom.find((zoom) => zoom.id === 'wordflow-inside-zoom');
    const slider = option.dataZoom.find((zoom) => zoom.id === 'wordflow-slider-zoom');
    // jsdom is not macOS, so the modifier is Ctrl; macOS uses 'meta' (Cmd).
    expect(inside?.zoomOnMouseWheel).toBe('ctrl');
    expect(slider?.fillerColor).toContain('--vscode-focusBorder');
  });

  it('caps the zoom when bars would be too thin, by chart type (issues 225, 226)', () => {
    // A 490 px element leaves 400 px to plot.
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(490);
    const bars = (stack?: string) => ({
      series: ['a', 'b', 'c'].map((id) => ({ id, type: 'bar', ...(stack ? { stack } : {}) })),
    });
    interface SetOptionArg {
      series: { stack?: string }[];
      dataZoom: { maxSpan?: number; start?: number; end?: number }[];
    }
    const lastOption = () => mocks.chart.setOption.mock.calls.at(-1)?.[0] as SetOptionArg;

    // Stacked: 4 px per period, so 100 of 250 fit (40% of the axis).
    const { unmount } = render(
      <EChartsView
        height={200}
        pointCount={250}
        dataResetKey="stacked"
        ariaLabel="Trends chart"
        option={bars('total')}
        fitBarsLabel="periods"
      />,
    );
    expect(lastOption().series.every((series) => series.stack === 'total')).toBe(true);
    expect(lastOption().dataZoom[0]).toMatchObject({ maxSpan: 40, start: 0, end: 40 });
    expect(screen.getByText(/Too many periods to show as bars at once/)).toHaveTextContent(
      'shows up to 100 of 250',
    );
    unmount();

    // Side by side: 3 groups × 6 px = 18 px per period, so 22 of 50 fit; never stacked.
    const { unmount: unmountSide } = render(
      <EChartsView
        height={200}
        pointCount={50}
        dataResetKey="side"
        ariaLabel="Trends chart"
        option={bars()}
        fitBarsLabel="periods"
      />,
    );
    expect(lastOption().series.some((series) => series.stack)).toBe(false);
    expect(lastOption().dataZoom[0]?.maxSpan).toBeCloseTo(44);
    expect(screen.getByText(/Too many periods/)).toHaveTextContent('shows up to 22 of 50');
    unmountSide();

    // Few periods: no cap, no message.
    render(
      <EChartsView
        height={200}
        pointCount={20}
        dataResetKey="few"
        ariaLabel="Trends chart"
        option={bars()}
        fitBarsLabel="periods"
      />,
    );
    expect(lastOption().dataZoom[0]?.maxSpan).toBe(100);
    expect(screen.queryByText(/Too many periods/)).not.toBeInTheDocument();
    width.mockRestore();
  });
});
