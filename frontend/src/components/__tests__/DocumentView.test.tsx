import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentView from '@/components/DocumentView';
vi.mock('@/config/env', () => ({ APP_VERSION: '0.7.1' }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
const target = {
  kind: 'tutorial' as const,
  key: 'index',
  file: 'tutorials/index.md',
  anchor: 'help-tutorial-index',
};
afterEach(() => vi.unstubAllGlobals());
describe('bundled Help', () => {
  it('loads only bundled Markdown and keeps ordinary external links', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Offline tutorial\n\n[Website](https://example.com)',
    });
    vi.stubGlobal('fetch', fetch);
    const view = render(<DocumentView docType="tutorial" target={target} />);
    expect(await screen.findByRole('heading', { name: 'Offline tutorial' })).toBeInTheDocument();
    expect(fetch.mock.calls[0]?.[0]).toBe(
      new URL('tutorials/index.md', window.location.href).toString(),
    );
    expect(screen.getByRole('heading', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    view.rerender(
      <DocumentView docType="tutorial" target={{ ...target, anchor: 'another-section' }} />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
  it('rejects unbundled documents without fetching them', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<DocumentView docType="tutorial" target={{ ...target, file: 'remote.md' }} />);
    expect(await screen.findByText('Bundled document is unavailable')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('resolves image paths from the bundled root', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, text: async () => '![Chart](tutorials/assets/chart.png)' }),
    );
    render(<DocumentView docType="tutorial" target={target} />);
    expect(await screen.findByRole('img', { name: 'Chart' })).toHaveAttribute(
      'src',
      new URL('tutorials/assets/chart.png', window.location.href).toString(),
    );
  });
  it('scrolls an initial anchor once after loading with the measured header offset', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<h2 id="help-tutorial-index">Start</h2>',
      }),
    );
    const view = render(<DocumentView docType="tutorial" target={target} />);
    const anchor = await screen.findByRole('heading', { name: 'Start' });
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    expect(anchor).toHaveStyle({ scrollMarginTop: '12px' });
    fireEvent.resize(window);
    view.rerender(<DocumentView docType="tutorial" target={{ ...target }} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockRestore();
  });
  it('aborts obsolete bundled downloads', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = options.signal as AbortSignal;
            signals.push(signal);
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const view = render(<DocumentView docType="tutorial" target={target} />);
    view.rerender(
      <DocumentView
        docType="tutorial"
        target={{ ...target, file: 'tutorials/preprocessing.md' }}
      />,
    );
    expect(signals[0]?.aborted).toBe(true);
    view.unmount();
    expect(signals[1]?.aborted).toBe(true);
  });
});
