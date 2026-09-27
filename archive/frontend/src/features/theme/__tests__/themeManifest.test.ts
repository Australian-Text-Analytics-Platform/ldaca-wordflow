import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ThemeManifest {
  themes: Record<string, Record<string, string>>;
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'theme/vscode-2026.json'), 'utf8'),
) as ThemeManifest;

describe('theme manifest', () => {
  it('provides identical semantic token coverage in both themes', () => {
    const light = Object.keys(manifest.themes['light-2026']).sort();
    const dark = Object.keys(manifest.themes['dark-2026']).sort();
    expect(dark).toEqual(light);
  });

});
