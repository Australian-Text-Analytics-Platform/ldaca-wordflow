import { type EChartsType } from 'echarts/core';

interface Line {
  id: string;
  type: string;
  showSymbol?: boolean;
  data: { value: [number, number | null]; selected?: boolean }[];
}

/** Continuous-axis marker density changes rendering only, never the observations. */
export function updatePlotMarkers(chart: EChartsType) {
  const series = chart.getOption().series as Line[];
  const updates = series.flatMap((line) => {
    if (line.type !== 'line') return [];
    const pixels = line.data
      .filter((point) => point.value[1] !== null)
      .map((point) => chart.convertToPixel({ gridIndex: 0 }, [point.value[0], point.value[1] ?? 0]))
      .filter((pixel) => chart.containPixel({ gridIndex: 0 }, pixel));
    const showSymbol = !pixels.some(
      (point, i) => i > 0 && Math.abs((point[0] ?? 0) - (pixels[i - 1]?.[0] ?? 0)) < 12,
    );
    return line.showSymbol === showSymbol ? [] : [{ id: line.id, showSymbol }];
  });
  if (updates.length) chart.setOption({ series: updates });
  series.forEach((line, seriesIndex) => {
    if (line.type !== 'line') return;
    line.data.forEach((point, dataIndex) => {
      if (point.selected)
        chart.dispatchAction({ type: 'highlight', seriesIndex, dataIndex, notBlur: true });
    });
  });
}
