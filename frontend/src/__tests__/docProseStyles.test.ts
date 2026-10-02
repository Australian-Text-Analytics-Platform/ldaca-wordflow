import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the Help window styles recorded in issue 262. Each rule fixes a
 * problem that came back when it was simplified; read the issue before
 * changing one.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('Help window styles (issue 262)', () => {
  it('maps the typography colours to theme tokens, not a fixed palette', () => {
    const prose = rule('.doc-prose');
    for (const [token, value] of [
      ['--tw-prose-body', 'var(--vscode-foreground)'],
      ['--tw-prose-headings', 'var(--vscode-foreground)'],
      ['--tw-prose-links', 'var(--vscode-textLink-foreground)'],
      ['--tw-prose-bullets', 'var(--vscode-descriptionForeground)'],
      ['--tw-prose-td-borders', 'var(--vscode-surface-border)'],
    ]) {
      expect(prose).toContain(`${token}: ${value};`);
    }
  });

  it('brings out faint screenshot detail with a gamma curve, never contrast()', () => {
    // contrast() pushes light greys to white and erased Project Graph edges.
    expect(rule('.doc-prose img')).toContain('filter: url(#doc-image-gamma);');
    expect(rule('[data-theme="dark-2026"] .doc-prose img')).toContain(
      'filter: url(#doc-image-gamma) brightness(0.8);',
    );
    expect(css).not.toMatch(/\.doc-prose img[^{]*\{[^}]*contrast\(/);
    expect(css).not.toMatch(/\.doc-prose img:hover/);
  });

  it('stops anchors below the pinned header', () => {
    expect(rule('.doc-prose [id]')).toContain('scroll-margin-top: var(--doc-header-offset, 96px);');
    expect(rule('.tutorial-highlight')).toContain(
      'scroll-margin-top: var(--doc-header-offset, 96px);',
    );
  });
});
