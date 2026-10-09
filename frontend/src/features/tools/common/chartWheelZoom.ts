import type { EChartsType } from 'echarts/core';

/** Leave ordinary wheel events to the pane. Pinch remains owned by ECharts. */
export function chartWheelZoom(element: HTMLElement, chart: EChartsType) {
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const controls = chart.getOption().dataZoom as
      | { type: string; start: number; end: number; yAxisIndex?: unknown }[]
      | undefined;
    if (!controls?.some((control) => control.type === 'inside')) return;
    event.preventDefault();
    const bounds = element.getBoundingClientRect();
    const factor = Math.exp(Math.max(-350, Math.min(350, event.deltaY)) * 0.002);
    const batch = controls.flatMap((control, index) => {
      if (control.type !== 'inside') return [];
      const span = Math.max(0.05, Math.min(100, (control.end - control.start) * factor));
      const anchor =
        control.yAxisIndex === undefined
          ? (event.clientX - bounds.left) / Math.max(1, bounds.width)
          : 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height);
      const start = Math.max(
        0,
        Math.min(
          100 - span,
          control.start + (control.end - control.start - span) * Math.max(0, Math.min(1, anchor)),
        ),
      );
      return [{ dataZoomIndex: index, start, end: start + span }];
    });
    chart.dispatchAction({ type: 'dataZoom', batch });
  };
  element.addEventListener('wheel', wheel, { passive: false });
  return () => element.removeEventListener('wheel', wheel);
}
