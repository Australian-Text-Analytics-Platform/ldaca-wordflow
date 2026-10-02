import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ThemeManifest {
  source: { version: string; commit: string };
  themes: Record<string, Record<string, string>>;
  adjustments?: Record<string, { gamma: number; brightness: number }>;
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'theme/vscode-2026.json'), 'utf8'),
) as ThemeManifest;

describe('pinned VS Code 2026 theme manifest', () => {
  it('remains pinned to the approved upstream snapshot', () => {
    expect(manifest.source).toMatchObject({
      version: '1.134.0',
      commit: '474a349ad5b745e512ef86b864d1c74f7264dd7a',
    });
  });

  it('provides identical semantic token coverage in both themes', () => {
    const light = Object.keys(manifest.themes['light-2026']).sort();
    const dark = Object.keys(manifest.themes['dark-2026']).sort();
    expect(dark).toEqual(light);
  });

  it('preserves representative exact upstream UI colors', () => {
    expect(manifest.themes['light-2026']).toMatchObject({
      'editor.background': '#FFFFFF',
      'button.background': '#0069CC',
      'commandCenter.background': '#FFFFFF',
      'commandCenter.border': '#D8D8D8AA',
      'commandCenter.activeBackground': '#DADADA4f',
      focusBorder: '#0069CCFF',
    });
    expect(manifest.themes['dark-2026']).toMatchObject({
      'editor.background': '#121314',
      'button.background': '#297AA0',
      'commandCenter.background': '#191A1B',
      'commandCenter.border': '#2E3031',
      'commandCenter.activeBackground': '#FFFFFF0F',
      focusBorder: '#3994BCB3',
    });
  });
});

/** The generated value of one token inside one theme's block. */
const generatedToken = (css: string, theme: string, token: string): string => {
  const start = css.indexOf(`[data-theme="${theme}"] {`);
  const block = css.slice(start, css.indexOf('}', start));
  const match = new RegExp(`--vscode-${token.replaceAll('.', '-')}: ([^;]+);`).exec(block);
  expect(match, `${theme} ${token}`).not.toBeNull();
  return match?.[1] ?? '';
};

describe('light theme readability curve (issue 263)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/vscode-2026.generated.css'), 'utf8');
  // Recomputed here on purpose, so a change to scripts/theme-adjust.mjs cannot
  // silently change the colours.
  const curve = (value: string, gamma: number, brightness: number): string =>
    value.replace(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/, (_, rgb: string, alpha = '') => {
      const channels = [0, 2, 4].map((index) =>
        Math.round(
          255 * (Number.parseInt(rgb.slice(index, index + 2), 16) / 255) ** gamma * brightness,
        )
          .toString(16)
          .padStart(2, '0'),
      );
      return `#${channels.join('').toUpperCase()}${alpha.toUpperCase()}`;
    });

  it('keeps gamma 1.3 and brightness 0.95 for the light theme only', () => {
    expect(manifest.adjustments).toEqual({ 'light-2026': { gamma: 1.3, brightness: 0.95 } });
  });

  it('writes every light colour through the curve and leaves dark colours as upstream', () => {
    for (const [token, value] of Object.entries(manifest.themes['light-2026'] ?? {})) {
      expect(generatedToken(css, 'light-2026', token)).toBe(curve(value, 1.3, 0.95));
    }
    for (const [token, value] of Object.entries(manifest.themes['dark-2026'] ?? {})) {
      expect(generatedToken(css, 'dark-2026', token)).toBe(value);
    }
  });

  it('darkens the pale greys that were hard to read, keeping black and softening white', () => {
    expect(generatedToken(css, 'light-2026', 'foreground')).toBe('#101010');
    expect(generatedToken(css, 'light-2026', 'descriptionForeground')).toBe('#444444');
  });
});
