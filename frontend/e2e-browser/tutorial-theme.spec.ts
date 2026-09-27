import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, screenshot } from './fixtures';

for (const theme of ['light-2026', 'dark-2026']) {
  it(`tutorial Markdown remains readable in ${theme}`, async () => {
    await browser.addInitScript((value) => {
      localStorage.setItem('ldaca-color-theme-v1', value);
    }, theme);
    await browser.url('/');
    await expect(role('heading', { name: 'Project Graph', exact: true })).toBeDisplayed();
    await role('button', { name: 'Project Graph', exact: true }).click();
    const tutorial = role('dialog', { name: 'Tutorial', exact: true });
    const markdown = tutorial.$('.prose');
    await expect(markdown.$('h2')).toExist();

    // Check the rendered palette, including raw HTML icons, rather than class names.
    const contrasts = await (await markdown.getElement()).execute((root) => {
      const luminance = (color: string) => {
        const components = color.match(/[\d.]+/g);
        if (!components || components.length < 3) throw new Error(`Unexpected color: ${color}`);
        const [red = 0, green = 0, blue = 0] = components
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return red * 0.2126 + green * 0.7152 + blue * 0.0722;
      };
      const surface = root.closest('main');
      if (!surface) throw new Error('Missing document surface');
      const background = luminance(getComputedStyle(surface).backgroundColor);
      return ['p', 'h2', 'strong', 'code', 'a', 'svg'].map((selector) => {
        const element = root.querySelector(selector);
        if (!element) throw new Error(`Missing tutorial element: ${selector}`);
        const style = getComputedStyle(element);
        const foreground = luminance(selector === 'svg' ? style.fill : style.color);
        return {
          selector,
          ratio:
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
        };
      });
    });
    for (const { ratio } of contrasts) {
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
    await markdown.$('#help-ui-data-viewer').scrollIntoView({ block: 'nearest' });
    await screenshot(`tutorial-${theme}.png`);
  });
}
