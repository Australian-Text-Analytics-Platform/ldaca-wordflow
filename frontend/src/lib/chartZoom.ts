/**
 * One wheel-zoom rule for every chart and graph (issue 215): plain scrolling
 * never zooms, so the pane keeps scrolling when the pointer crosses a chart.
 * Holding Cmd (macOS) or Ctrl (elsewhere) while scrolling zooms, and a
 * trackpad pinch zooms where the chart supports it. The Project Graph follows
 * the same key and additionally pans on a plain scroll (issue 194).
 */

const isApplePlatform = (
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean => /Macintosh|Mac OS X|iPhone|iPad/.test(userAgent);

/** React Flow `zoomActivationKeyCode` / `useKeyPress` key. */
export const CHART_ZOOM_KEY: 'Meta' | 'Control' = isApplePlatform() ? 'Meta' : 'Control';

/**
 * ECharts `dataZoom.zoomOnMouseWheel` modifier. ECharts checks
 * `event[modifier + 'Key']`, so 'meta' works although its types list only
 * 'shift', 'ctrl' and 'alt'.
 */
export const ECHARTS_WHEEL_ZOOM_MODIFIER = (isApplePlatform() ? 'meta' : 'ctrl') as 'ctrl';

/** True for a wheel event that should zoom a chart: the zoom key is held. */
export function isChartZoomWheel(event: Pick<WheelEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return CHART_ZOOM_KEY === 'Meta' ? event.metaKey : event.ctrlKey;
}
