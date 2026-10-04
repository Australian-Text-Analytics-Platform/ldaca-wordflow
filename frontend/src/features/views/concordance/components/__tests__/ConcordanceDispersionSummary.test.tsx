import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConcordanceDispersionSummary } from '../ConcordanceDispersionSummary';
import { SLIDER_OVERVIEW_ID } from '../../../common/sliderOverview';

interface CapturedChart {
  option: Record<string, unknown>;
  onSelect?: (index: number, shiftHeld: boolean) => void;
  selectionHint?: string;
}

const { charts } = vi.hoisted(() => ({ charts: [] as CapturedChart[] }));

vi.mock('@/features/views/common/components/EChartsView', () => ({
  EChartsView: (props: CapturedChart) => {
    charts.push(props);
    return <div data-testid="concordance-echarts" />;
  },
}));

const baseRows = [
  {
    text: 'alpha beta alpha',
    CONC_dispersion: [
      {
        CONC_start_idx: 0,
        CONC_end_idx: 5,
        CONC_matched_text: 'alpha',
      },
    ],
  },
];

const lastOption = () => charts.at(-1)?.option;
// The chart's own series, without the hidden slider overview (issue 269).
const optionSeries = () =>
  ((lastOption()?.series ?? []) as Record<string, unknown>[]).filter(
    (item) => item.id !== SLIDER_OVERVIEW_ID,
  );
const optionSource = () => {
  const dataset = lastOption()?.dataset as { source?: Record<string, unknown>[] } | undefined;
  return dataset?.source ?? [];
};

describe('ConcordanceDispersionSummary', () => {
  afterEach(() => {
    charts.length = 0;
  });

  it('renders chart controls and the ECharts boundary', () => {
    render(
      <ConcordanceDispersionSummary
        rows={baseRows}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        chartMode="density-line"
        onChartModeChange={vi.fn()}
        onBinCountChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Sections' })).toHaveAttribute(
      'data-state',
      'closed',
    );
    expect(screen.getByRole('combobox', { name: 'Chart' })).toHaveTextContent('Line');
    expect(screen.getByText('Where matches occur in the documents')).toBeInTheDocument();
    expect(screen.getByTestId('concordance-echarts')).toBeInTheDocument();
  });

  it('lists every chart type, including Running total, and forwards the choice (issue 205)', () => {
    const onChartModeChange = vi.fn();
    render(
      <ConcordanceDispersionSummary
        rows={baseRows}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        onChartModeChange={onChartModeChange}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Running total' }));
    expect(onChartModeChange).toHaveBeenCalledWith('cumulative');
  });

  it('feeds the range slider an overview of all sources across the full axis (issue 269)', () => {
    render(
      <ConcordanceDispersionSummary
        rows={baseRows}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        chartMode="density-bar"
      />,
    );
    const all = (lastOption()?.series ?? []) as Record<string, unknown>[];
    const overview = all[0] as { id: string; yAxisIndex: number; data: [number, number][] };
    expect(overview.id).toBe(SLIDER_OVERVIEW_ID);
    expect(overview.yAxisIndex).toBe(1);
    expect(overview.data[0]?.[0]).toBe(0);
    expect(overview.data.at(-1)?.[0]).toBeCloseTo(100);
    expect(Math.max(...overview.data.map(([, value]) => value))).toBeGreaterThan(0);
  });

  it('maps density line, bar, and area modes to ECharts series', () => {
    const props = {
      rows: baseRows,
      textColumn: 'text',
      binCount: 20 as const,
      splitBySource: false,
      dataBlockLabel: 'Corpus',
      searchWord: 'alpha',
    };
    const { rerender } = render(
      <ConcordanceDispersionSummary {...props} chartMode="density-line" />,
    );
    expect(optionSeries()[0]).toMatchObject({
      type: 'line',
      showSymbol: true,
      smooth: true,
      emphasis: { focus: 'series', scale: false },
      blur: {
        itemStyle: { opacity: 0.45 },
        lineStyle: { opacity: 0.45 },
      },
    });

    rerender(<ConcordanceDispersionSummary {...props} chartMode="density-bar" />);
    expect(optionSeries()[0]).toMatchObject({
      type: 'bar',
      stack: 'density',
      emphasis: { focus: 'series' },
      blur: { itemStyle: { opacity: 0.45 } },
    });

    rerender(<ConcordanceDispersionSummary {...props} chartMode="density-area" />);
    expect(optionSeries()[0]).toMatchObject({
      type: 'line',
      stack: 'density',
      areaStyle: { opacity: 0.35 },
      emphasis: { focus: 'series', scale: false },
      blur: {
        itemStyle: { opacity: 0.45 },
        lineStyle: { opacity: 0.45 },
        areaStyle: { opacity: 0.1575 },
      },
    });
  });

  it('stacks the first term on top and marks tooltip lines with colour dots (issue 243)', () => {
    const props = {
      rows: [],
      textColumn: 'text',
      binCount: 20 as const,
      splitBySource: false,
      dataBlockLabel: 'Corpus',
      searchWord: 'jobs',
      densitySeries: [
        { label: 'jobs', counts: Array.from({ length: 100 }, () => 1) },
        { label: 'work', counts: Array.from({ length: 100 }, () => 2) },
      ],
      termColors: { jobs: '#123456', work: '#abcdef' },
    };
    const ids = () => optionSeries().map((item) => String(item.id));
    const { rerender } = render(
      <ConcordanceDispersionSummary {...props} chartMode="density-line" />,
    );
    const legendOrder = ids();
    expect(legendOrder.length).toBeGreaterThan(1);

    rerender(<ConcordanceDispersionSummary {...props} chartMode="density-area" />);
    expect(ids()).toEqual([...legendOrder].reverse());

    const formatter = (lastOption()?.tooltip as { formatter: (params: unknown) => string })
      .formatter;
    const row = optionSource()[0];
    const text = formatter(
      [...legendOrder].reverse().map((id, index) => ({
        value: row,
        seriesId: id,
        marker: `{marker${String(index)}|}`,
      })),
    );
    const lines = text.split('\n').slice(1);
    expect(lines.map((line) => line.slice(0, line.indexOf('|}') + 2))).toEqual(
      legendOrder.map((_id, index) => `{marker${String(legendOrder.length - 1 - index)}|}`),
    );
  });

  it('shows selected bins in the Trends selection style (issue 191)', () => {
    render(
      <ConcordanceDispersionSummary
        rows={baseRows}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        chartMode="density-line"
        selection={{
          selectedIndices: new Set([1]),
          onSelect: vi.fn(),
          onClear: vi.fn(),
        }}
      />,
    );

    const lineSeries = optionSeries()[0];
    const symbol = lineSeries?.symbol as (value: unknown, params: { dataIndex?: number }) => string;
    const symbolSize = lineSeries?.symbolSize as (
      value: unknown,
      params: { dataIndex?: number },
    ) => number;
    expect(lineSeries).toMatchObject({
      showSymbol: true,
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
    });
    expect(symbol(undefined, { dataIndex: 0 })).toBe('emptyCircle');
    expect(symbol(undefined, { dataIndex: 1 })).toBe('circle');
    expect(symbolSize(undefined, { dataIndex: 1 })).toBeGreaterThan(
      2 * symbolSize(undefined, { dataIndex: 0 }),
    );
    // Bin 1 of 20 is shaded from 5% to 10%.
    expect((lineSeries as { markArea?: { data: unknown } }).markArea?.data).toEqual([
      [{ xAxis: 5 }, { xAxis: 10 }],
    ]);
  });

  it.each([4, 5, 10] as const)(
    'groups bars at %i bins without extra background components',
    (binCount) => {
      render(
        <ConcordanceDispersionSummary
          rows={[]}
          textColumn="text"
          binCount={binCount}
          splitBySource={false}
          dataBlockLabel="Corpus"
          searchWord="jobs Jobs"
          chartMode="density-bar"
          densitySeries={[
            { label: 'jobs', counts: Array.from({ length: 100 }, () => 1) },
            { label: 'Jobs', counts: Array.from({ length: 100 }, () => 2) },
          ]}
        />,
      );

      expect(optionSeries()).toHaveLength(2);
      expect(optionSeries().every((item) => item.stack === undefined)).toBe(true);
      expect(optionSeries()[0]).toMatchObject({ barGap: '10%', barCategoryGap: '8%' });
      expect(optionSeries()[0]?.markArea).toBeUndefined();
    },
  );

  it.each([20, 25, 50, 100] as const)('stacks bar series at %i bins', (binCount) => {
    render(
      <ConcordanceDispersionSummary
        rows={[]}
        textColumn="text"
        binCount={binCount}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="jobs Jobs"
        chartMode="density-bar"
        densitySeries={[
          { label: 'jobs', counts: Array.from({ length: 100 }, () => 1) },
          { label: 'Jobs', counts: Array.from({ length: 100 }, () => 2) },
        ]}
      />,
    );

    expect(optionSeries().every((item) => item.stack === 'density')).toBe(true);
    expect(optionSeries()[0]?.markArea).toBeUndefined();
  });

  it('keeps shared match controls mounted when the chart is hidden', () => {
    render(
      <ConcordanceDispersionSummary
        rows={baseRows}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        showChart={false}
        onUncasedMatchedTextsChange={vi.fn()}
        onToggleMatchedTexts={vi.fn()}
      />,
    );

    expect(screen.getByTestId('filterable-series-controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'alpha (1)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ignore capitals' })).toBeInTheDocument();
    expect(screen.queryByTestId('concordance-dispersion-chart')).not.toBeInTheDocument();
  });

  it('keeps hidden terms in the legend and removes them from the ECharts series', () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    render(
      <ConcordanceDispersionSummary
        rows={[]}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        densitySeries={[
          { label: 'Alpha', counts: Array.from({ length: 100 }, () => 2) },
          { label: 'alpha', counts: Array.from({ length: 100 }, () => 1) },
        ]}
        selection={{
          selectedIndices: new Set([0]),
          onSelect: vi.fn(),
          onClear,
        }}
        excludedMatchedTexts={new Set(['alpha'])}
        onToggleMatchedTexts={onToggle}
      />,
    );

    const controls = screen.getByTestId('filterable-series-controls');
    const hidden = within(controls).getByRole('button', { name: 'alpha (5/100)' });
    expect(hidden).toHaveAttribute('aria-pressed', 'true');
    expect(optionSeries()).toHaveLength(1);
    fireEvent.click(hidden);
    expect(onToggle).toHaveBeenCalledWith(['alpha']);
    fireEvent.click(within(controls).getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('uses exact matched-term colors and merges case variants when uncased', () => {
    const onToggle = vi.fn();
    render(
      <ConcordanceDispersionSummary
        rows={[]}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="jobs"
        densitySeries={[
          { label: 'jobs', counts: Array.from({ length: 100 }, () => 1) },
          { label: 'Jobs', counts: Array.from({ length: 100 }, () => 2) },
        ]}
        termColors={{ jobs: '#123456', Jobs: '#abcdef' }}
        uncasedMatchedTexts
        onToggleMatchedTexts={onToggle}
      />,
    );

    expect(optionSeries()).toHaveLength(1);
    expect(optionSeries()[0]).toMatchObject({
      id: 'term:jobs',
      itemStyle: { color: '#123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'jobs/Jobs (300)' }));
    expect(onToggle).toHaveBeenCalledWith(['jobs', 'Jobs']);
  });

  it('renders cumulative charts as stepped running totals pooled by exact term', () => {
    render(
      <ConcordanceDispersionSummary
        rows={[
          {
            text: 'x'.repeat(100),
            __source_node: 'Left Corpus',
            CONC_dispersion: [{ CONC_start_idx: 0, CONC_end_idx: 1, CONC_matched_text: 'alpha' }],
          },
          {
            text: 'x'.repeat(100),
            __source_node: 'Right Corpus',
            CONC_dispersion: [{ CONC_start_idx: 25, CONC_end_idx: 26, CONC_matched_text: 'alpha' }],
          },
        ]}
        textColumn="text"
        binCount={20}
        splitBySource
        dataBlockLabel="Combined"
        searchWord="alpha"
        chartMode="cumulative"
        termColors={{ alpha: '#aa0000' }}
      />,
    );

    expect(optionSeries()[0]).toMatchObject({
      type: 'line',
      step: 'middle',
      showSymbol: false,
      emphasis: { focus: 'series', scale: false },
      blur: {
        itemStyle: { opacity: 0.45 },
        lineStyle: { opacity: 0.45 },
      },
    });
    expect(optionSeries()[0]).not.toHaveProperty('smooth');
    expect(optionSource()[0]).toMatchObject({ binCenter: 2.5, 'term:alpha': 1 });
    expect(optionSource()[5]).toMatchObject({
      binCenter: expect.closeTo(27.5),
      'term:alpha': 2,
    });
  });

  it('says a Combined chart pools both Data Blocks (issue 282)', () => {
    const row = (source: string) => ({
      text: 'x'.repeat(100),
      __source_node: source,
      CONC_dispersion: [{ CONC_start_idx: 0, CONC_end_idx: 1, CONC_matched_text: 'alpha' }],
    });
    const { rerender } = render(
      <ConcordanceDispersionSummary
        rows={[row('Left Corpus'), row('Right Corpus')]}
        textColumn="text"
        binCount={20}
        splitBySource
        dataBlockLabel="Combined"
        searchWord="alpha"
        termColors={{ alpha: '#aa0000' }}
      />,
    );
    expect(
      screen.getByText(
        'Combines Left Corpus and Right Corpus: each line counts the term in both. Choose Separated view for one chart per Data Block.',
      ),
    ).toBeInTheDocument();

    rerender(
      <ConcordanceDispersionSummary
        rows={[row('Left Corpus')]}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Left Corpus"
        searchWord="alpha"
        termColors={{ alpha: '#aa0000' }}
      />,
    );
    expect(screen.queryByText(/^Combines /)).not.toBeInTheDocument();
  });

  it('forwards click selection and the Shift-click hint to the ECharts boundary (issue 224)', () => {
    const onSelect = vi.fn();
    render(
      <ConcordanceDispersionSummary
        rows={baseRows}
        textColumn="text"
        binCount={20}
        splitBySource={false}
        dataBlockLabel="Corpus"
        searchWord="alpha"
        selection={{ selectedIndices: new Set(), onSelect, onClear: vi.fn() }}
      />,
    );

    charts.at(-1)?.onSelect?.(3, true);
    expect(onSelect).toHaveBeenCalledWith(3, true);
    expect(charts.at(-1)?.selectionHint).toMatch(/Shift-click another section/);
  });
});
