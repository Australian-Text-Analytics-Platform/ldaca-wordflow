/* eslint-disable testing-library/no-container, testing-library/no-node-access -- the guarded nodes (an SVG filter, CSS classes, a custom property) have no accessible role. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DocumentView from '@/components/DocumentView';

/**
 * Guards the Help window layout recorded in issue 262 (pinned header,
 * theme-following text, gamma curve for screenshots). Read the issue before
 * changing what these assert.
 */
vi.mock('@/config/env', () => ({
  APP_VERSION: '0.7.1',
  APP_BUILD_DATE: '04/Aug/2026',
  APP_BUILD: 'abc1234',
  APP_COMMIT_URL: '',
  getDocsBaseUrl: () => '',
}));

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

const target = {
  kind: 'tutorial' as const,
  key: 'index',
  file: 'tutorials/index.md',
  anchor: 'help-tutorial-index',
};

describe('DocumentView layout (issue 262)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('keeps the gamma filter, pinned header, and theme-following text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Doc'),
    }) as unknown as typeof fetch;

    const { container } = render(<DocumentView docType="tutorial" target={target} />);
    await screen.findByRole('heading', { name: 'Doc' });

    // Gamma curve for screenshots: R, G and B at exponent 1.4.
    const filter = container.querySelector('filter#doc-image-gamma');
    expect(filter?.getAttribute('color-interpolation-filters')).toBe('sRGB');
    const channels = [...(filter?.querySelectorAll('feFuncR, feFuncG, feFuncB') ?? [])];
    expect(
      channels.map((node) => [node.getAttribute('type'), node.getAttribute('exponent')]),
    ).toEqual([
      ['gamma', '1.4'],
      ['gamma', '1.4'],
      ['gamma', '1.4'],
    ]);
    // Pinned header, theme-following text, and the anchor offset it sets.
    expect(container.querySelector('header')?.className).toMatch(/\bsticky\b.*\btop-0\b/);
    const prose = container.querySelector('.doc-prose');
    expect(prose).not.toBeNull();
    expect(prose?.className).not.toMatch(/prose-slate/);
    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue('--doc-header-offset'),
    ).toMatch(/px$/);
  });
});
