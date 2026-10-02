import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import DocumentView from '@/components/DocumentView';

const docsConfig = vi.hoisted(() => ({
  baseUrl: 'https://docs.example.com/wordflow/v0.7',
  commitUrl: 'https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/commit/abc1234',
}));

vi.mock('@/config/env', () => ({
  APP_VERSION: '0.7.1',
  APP_BUILD_DATE: '04/Aug/2026',
  APP_BUILD: 'abc1234',
  get APP_COMMIT_URL() {
    return docsConfig.commitUrl;
  },
  getDocsBaseUrl: () => docsConfig.baseUrl,
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

describe('DocumentView (docType="tutorial")', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    docsConfig.baseUrl = 'https://docs.example.com/wordflow/v0.7';
    docsConfig.commitUrl =
      'https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/commit/abc1234';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('uses remote Markdown before the bundled copy', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Remote tutorial'),
    });

    const { rerender } = render(<DocumentView docType="tutorial" target={target} />);

    expect(await screen.findByRole('heading', { name: 'Remote tutorial' })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toBe(
      'https://docs.example.com/wordflow/v0.7/tutorials/index.md',
    );

    rerender(
      <DocumentView docType="tutorial" target={{ ...target, anchor: 'help-tutorial-index-2' }} />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it('falls back to bundled Markdown when the matching remote tag is absent', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('# Bundled tutorial'),
      });

    render(<DocumentView docType="tutorial" target={target} />);

    expect(await screen.findByRole('heading', { name: 'Bundled tutorial' })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(global.fetch).mock.calls[1]?.[0])).not.toContain('docs.example.com');
  });

  it('uses bundled Markdown directly when no docs origin is configured', async () => {
    docsConfig.baseUrl = '';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Offline tutorial'),
    });

    render(<DocumentView docType="tutorial" target={target} />);

    expect(await screen.findByRole('heading', { name: 'Offline tutorial' })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).not.toContain('docs.example.com');
  });

  it('resolves documentation assets from the source that supplied the Markdown', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('![Remote chart](tutorials/assets/chart.png)'),
    });

    render(<DocumentView docType="tutorial" target={target} />);

    expect(await screen.findByRole('img', { name: 'Remote chart' })).toHaveAttribute(
      'src',
      'https://docs.example.com/wordflow/v0.7/tutorials/assets/chart.png',
    );
  });

  it('names and links the exact commit in the version footer', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          'Version {{VERSION}} - released on {{BUILD_DATE}}<span data-build-commit></span>.',
        ),
    }) as unknown as typeof fetch;

    render(<DocumentView docType="tutorial" target={target} />);

    const link = await screen.findByRole('link', { name: 'abc1234' });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/commit/abc1234',
    );
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Version 0.7.1 - released on 04/Aug/2026, commit abc1234.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves the commit out when the build has none', async () => {
    docsConfig.commitUrl = '';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          'Version {{VERSION}} - released on {{BUILD_DATE}}<span data-build-commit></span>.',
        ),
    }) as unknown as typeof fetch;

    render(<DocumentView docType="tutorial" target={target} />);

    const versionLine = await screen.findByText('Version 0.7.1 - released on 04/Aug/2026.');
    expect(within(versionLine).queryByRole('link')).not.toBeInTheDocument();
  });

  it('links each partner logo in the header to its home page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Doc'),
    }) as unknown as typeof fetch;

    render(<DocumentView docType="reference" target={target} />);

    const logos = within(await screen.findByTestId('partner-logos')).getAllByRole('link');
    expect(logos.map((link) => link.getAttribute('href'))).toEqual([
      'https://www.ldaca.edu.au/',
      'https://ardc.edu.au/',
      'https://www.education.gov.au/ncris',
      'https://sydneycorpuslab.com/',
      'https://informatics.sydney.edu.au/',
    ]);
    expect(screen.getByRole('heading', { level: 1, name: 'References' })).toBeInTheDocument();
  });
});
