import { describe, expect, it } from 'vite-plus/test';

import { VIZ_PALETTE, foregroundForVizColor } from '../vizPalette';

/** WCAG relative luminance of an #rrggbb colour. */
function luminance(hex: string): number {
  const linear = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

const contrast = (foreground: string, background: string): number => {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

describe('foregroundForVizColor', () => {
  it('chooses a WCAG-readable foreground for every saturated identity colour', () => {
    for (const background of VIZ_PALETTE) {
      const foreground = foregroundForVizColor(background);
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
