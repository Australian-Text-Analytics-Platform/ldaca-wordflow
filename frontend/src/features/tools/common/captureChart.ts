import { getInstanceByDom, init } from 'echarts/core';

/** Render a captured option offscreen; never toggle controls on the live plot. */
export function captureChart(host: HTMLDivElement): SVGSVGElement {
  const live = getInstanceByDom(host);
  if (!live) throw new Error('Chart is not ready');
  const option = live.getOption();
  const element = document.createElement('div');
  element.style.cssText = `position:fixed;left:-100000px;width:${String(live.getWidth())}px;height:${String(live.getHeight())}px`;
  document.body.append(element);
  const copy = init(element, undefined, {
    renderer: 'svg',
    width: live.getWidth(),
    height: live.getHeight(),
  });
  try {
    copy.setOption({
      ...option,
      animation: false,
      tooltip: { show: false },
      dataZoom: (option.dataZoom as object[] | undefined)?.map((control) => ({
        ...control,
        show: false,
      })),
      visualMap: (option.visualMap as { min: number; max: number }[] | undefined)?.map(
        (control) => ({
          ...control,
          calculable: false,
          text: [String(control.max), String(control.min)],
        }),
      ),
    });
    const series = option.series as { data?: ({ selected?: boolean } | null)[] }[] | undefined;
    series?.forEach((item, seriesIndex) => {
      item.data?.forEach((point, dataIndex) => {
        if (point?.selected)
          copy.dispatchAction({ type: 'highlight', seriesIndex, dataIndex, notBlur: true });
      });
    });
    const svg = element.querySelector('svg');
    if (!svg) throw new Error('Chart is not ready');
    return svg.cloneNode(true) as SVGSVGElement;
  } finally {
    copy.dispose();
    element.remove();
  }
}
