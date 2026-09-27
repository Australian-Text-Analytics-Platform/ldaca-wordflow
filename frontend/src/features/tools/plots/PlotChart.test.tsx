/* eslint-disable testing-library/no-node-access, testing-library/no-container -- Assert the actual SVG renderer output. */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setPlatformAPI } from 'echarts/core';
import { captureChart } from '../common/captureChart';
import { PlotChart } from './PlotChart';
import { buildPlot, type PlotDisplay } from './plotModel';
import type { TrendsRequest } from '@/features/project/api';

vi.mock('@/features/theme/themeRuntime', () => ({ useActiveTheme: () => 'light' }));

setPlatformAPI({ measureText: (text) => ({ width: text.length * 7 }) });
afterEach(() => vi.restoreAllMocks());

it('keeps real SVG connecting paths after the first and subsequent legend redraws', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(460);
  const request: TrendsRequest = {
    source: { schema: 'data', name: 'survey' },
    axis: 'day',
    groups: ['topic'],
    measure: 'count',
    value: null,
    interval: { type: 'time', unit: 'day', step: 1 },
    timezone: 'UTC',
  };
  const display: PlotDisplay = {
    style: 'line',
    smooth: true,
    normalize: false,
    uncased: false,
    minimum_rows: 0,
    order: 'total',
    year: 2026,
    nonnegative: true,
  };
  const rows = ['A', 'B', 'C'].flatMap((group, g) =>
    Array.from({ length: 8 }, (_, i) => ({
      group_key: JSON.stringify([group]),
      interval_key: `2026-10-${String(i + 10)} 00:00:00`,
      axis_value: `2026-10-${String(i + 10)} 00:00:00`,
      value: (i + 1) * (g + 1),
      row_count: i + 1,
    })),
  );
  const chart = (hidden: string[]) => {
    const model = buildPlot('trends', request, rows, display, {
      hidden,
      intervals: [],
      cells: [],
      rows: [],
      transitions: [],
    });
    return (
      <PlotChart
        option={model.option}
        points={model.points}
        height={460}
        rectangular={false}
        intervals
        cartesian
        onSelect={vi.fn()}
      />
    );
  };
  const { container, rerender } = render(chart([]));
  const lines = () =>
    [...container.querySelectorAll('svg path')].filter(
      (p) =>
        p.getAttribute('stroke-width') === '2' &&
        p.getAttribute('fill') === 'none' &&
        /C/.test(p.getAttribute('d') ?? '') &&
        !/NaN/.test(p.getAttribute('d') ?? '') &&
        !['transparent', 'none'].includes(p.getAttribute('stroke') ?? 'none'),
    );
  expect(lines()).toHaveLength(3);
  const svg = container.querySelector('svg');
  rerender(chart(['["B"]']));
  expect(container.querySelector('svg')).toBe(svg);
  expect(lines()).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in', exact: true }));
  rerender(chart([]));
  expect(lines()).toHaveLength(3);
  rerender(chart(['["A"]', '["B"]', '["C"]']));
  expect(lines()).toHaveLength(0);
  rerender(chart([]));
  expect(lines()).toHaveLength(3);
});

it('zooms the mounted Heatmap, preserves zoom on selection redraw, and resets', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(850);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  const { getInstanceByDom } = await import('echarts/core');
  const request = {
    source: { schema: 'data', name: 'survey' },
    row: 'topic',
    column: 'region',
    measure: 'count' as const,
    value: null,
  };
  const display: PlotDisplay = {
    style: 'line',
    smooth: true,
    normalize: false,
    uncased: false,
    minimum_rows: 0,
    order: 'total',
    year: 2026,
    nonnegative: true,
  };
  const rows = Array.from({ length: 8 }, (_, i) => ({
    category_key: JSON.stringify([`Topic ${i}`]),
    column_key: JSON.stringify([`Region ${i}`]),
    cell_key: JSON.stringify([`Topic ${i}`, `Region ${i}`]),
    value: i + 1,
    row_count: i + 1,
  }));
  const chart = (cells: string[]) => {
    const model = buildPlot('heatmap', request, rows, display, {
      hidden: [],
      intervals: [],
      rows: [],
      transitions: [],
      cells,
    });
    return (
      <PlotChart
        option={model.option}
        points={model.points}
        height={600}
        rectangular
        intervals={false}
        cartesian
        onSelect={vi.fn()}
      />
    );
  };
  const { rerender } = render(chart([]));
  const host = screen.getByRole('application');
  const instance = getInstanceByDom(host);
  const zoom = () => instance?.getOption().dataZoom as { start: number; end: number }[];
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in', exact: true }));
  expect(zoom()[0]?.start).toBeGreaterThan(0);
  expect(zoom()[0]?.end).toBeLessThan(100);
  const before = zoom().map(({ start, end }) => ({ start, end }));
  rerender(chart(['["Topic 2","Region 2"]']));
  expect(zoom().map(({ start, end }) => ({ start, end }))).toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: 'Reset zoom', exact: true }));
  expect(zoom()[0]).toMatchObject({ start: 0, end: 100 });
  fireEvent.click(screen.getByRole('button', { name: 'Select range' }));
  expect(screen.getByRole('button', { name: 'Select range' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Zoom area' }));
  expect(screen.getByRole('button', { name: 'Select range' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Zoom area' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(host, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Zoom area' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('lays calendars out in columns and inspects the same date without selecting', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  const model = buildPlot(
    'trends',
    {
      source: { schema: 'data', name: 'survey' },
      axis: 'day',
      groups: ['group'],
      measure: 'mean',
      value: 'score',
      interval: { type: 'time', unit: 'day', step: 1 },
      timezone: 'UTC',
    },
    ['A', 'B'].flatMap((group, index) => [
      {
        group_key: JSON.stringify([group]),
        interval_key: '2026-10-17',
        axis_value: '2026-10-17',
        value: index ? null : 0,
        row_count: 1,
      },
      {
        group_key: JSON.stringify([group]),
        interval_key: '2026-10-18',
        axis_value: '2026-10-18',
        value: 2,
        row_count: 1,
      },
    ]),
    {
      style: 'calendar',
      smooth: true,
      normalize: false,
      uncased: false,
      minimum_rows: 0,
      order: 'total',
      year: 2026,
      nonnegative: true,
    },
    { hidden: [], intervals: [], cells: [], rows: [], transitions: [] },
    700,
  );
  const calendars = model.option.calendar as { left: number; top: number; range: string[] }[];
  expect(calendars[0]?.top).toBe(calendars[1]?.top);
  expect(calendars[0]?.left).toBeLessThan(calendars[1]!.left);
  expect(calendars[0]?.range).toEqual(['2026-10-01', '2026-10-31']);
  const select = vi.fn();
  render(
    <PlotChart
      option={model.option}
      points={model.points}
      height={model.height}
      minimumWidth={model.minimumWidth}
      rectangular={false}
      intervals
      cartesian={false}
      onSelect={select}
    />,
  );
  const host = screen.getByRole('application');
  fireEvent.keyDown(host, { key: 'Home' });
  expect(screen.getAllByRole('tooltip')).toHaveLength(2);
  expect(screen.getAllByText(/Outside the observed date range/)).toHaveLength(2);
  for (let i = 0; i < 16; i++) fireEvent.keyDown(host, { key: 'ArrowRight' });
  expect(screen.getByText(/No usable measurement/)).toBeInTheDocument();
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(host, { key: 'Enter' });
  expect(select).toHaveBeenCalledWith(['2026-10-17'], false, false);
  fireEvent.blur(host);
  expect(screen.queryAllByRole('tooltip')).toHaveLength(0);
  const chartElement = screen.getByTestId('plot-chart');
  const figure = captureChart(chartElement as HTMLDivElement);
  expect(figure.textContent).toContain('2');
  expect(figure.textContent).toContain('0');
  expect(figure.textContent).not.toContain('Outside the observed date range');
});
