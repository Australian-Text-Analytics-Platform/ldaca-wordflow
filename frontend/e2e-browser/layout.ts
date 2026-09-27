import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { ASIDE_PANEL_DEFAULT_RATIO } from '../src/config/layout';

/** Normal layout is the baseline; extremes are explicit responsive checks. */
export async function setAnalysisPaneSize(size: 'normal' | 'narrow' | 'wide') {
  const splitter = $('[role="separator"][aria-label="Resize right panel"]');
  await splitter.execute((element) => { element.focus(); });
  if (size === 'normal') {
    await browser.keys(Key.Enter);
  } else {
    // The embedded driver maps arrows, but not WebDriver Home/End codes.
    for (let step = 0; step < 20; step++) {
      await browser.keys(size === 'narrow' ? Key.ArrowLeft : Key.ArrowRight);
    }
  }
  const expected = size === 'normal'
    ? String(ASIDE_PANEL_DEFAULT_RATIO * 100)
    : await splitter.getAttribute(size === 'narrow' ? 'aria-valuemax' : 'aria-valuemin');
  await expect(splitter).toHaveAttribute('aria-valuenow', expected ?? '');
  // WebKit can report a background native window as hidden. Its animation API
  // then refuses waitForStable even though layout is readable and events work.
  let previous: number | undefined;
  await browser.waitUntil(async () => {
    const position = await splitter.getLocation('x');
    const stable = position === previous;
    previous = position;
    return stable;
  }, { timeoutMsg: 'The analysis splitter did not settle after resizing' });
}
