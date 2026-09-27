import { $, browser, expect } from '@wdio/globals';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';

export async function layoutScenario(prefix: string) {
  const splitter = $('[role="separator"][aria-label="Resize right panel"]');
  await expect(splitter).toHaveAttribute('aria-valuenow', '30');
  const widths = await splitter.execute((element) => {
    const container = element.parentElement;
    const graph = container?.querySelector('aside');
    if (!container || !graph) throw new Error('Missing split layout');
    return {
      shell: container.getBoundingClientRect().width,
      graph: graph.getBoundingClientRect().width,
    };
  }) as { shell: number; graph: number };
  expect(widths.graph / widths.shell).toBeCloseTo(0.3, 1);
  await browser.saveScreenshot(`.tmp/wdio/${prefix}-layout-normal.png`);
  try {
    await setAnalysisPaneSize('narrow');
    await browser.refresh();
    await expect(splitter).toHaveAttribute('aria-valuenow', (await splitter.getAttribute('aria-valuemax')) ?? '');
    await browser.waitUntil(async () => splitter.execute((element) =>
      (element.parentElement?.querySelector('aside')?.getBoundingClientRect().width ?? Infinity) <= 801,
    ));
    await browser.saveScreenshot(`.tmp/wdio/${prefix}-layout-narrow.png`);
    await setAnalysisPaneSize('wide');
    if (await browser.execute(() => '__TAURI_INTERNALS__' in window)) {
      // The embedded driver emits two detail=0 clicks, not a dblclick event.
      // Chrome covers the real double-click; exercise native keyboard reset here.
      await setAnalysisPaneSize('normal');
    } else {
      await splitter.doubleClick();
    }
    await expect(splitter).toHaveAttribute('aria-valuenow', '30');
    await browser.refresh();
    await expect(splitter).toHaveAttribute('aria-valuenow', '30');
  } finally {
    await setAnalysisPaneSize('normal');
  }
}
