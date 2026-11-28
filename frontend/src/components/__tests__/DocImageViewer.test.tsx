import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentView from '@/components/DocumentView';
import { DocImageViewer } from '@/components/DocImageViewer';

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

const target = { kind: 'tutorial' as const, key: 'index', file: 'tutorials/index.md', anchor: '' };

/** jsdom lays nothing out: the viewer's size observer is replaced by one the test fires. */
let reportSize: (() => void)[] = [];
class FiredResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    reportSize.push(() => {
      this.callback([], this as unknown as ResizeObserver);
    });
  }
  unobserve = vi.fn();
  disconnect = vi.fn();
}

/** Gives the viewer a 1000 x 600 area and the image a real size, which jsdom has none of. */
const sizeViewer = (naturalWidth: number, naturalHeight: number) => {
  const area = screen.getByTestId('doc-image-viewport');
  Object.defineProperty(area, 'clientWidth', { configurable: true, value: 1032 });
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: 632 });
  act(() => {
    for (const report of reportSize) report();
  });
  const image = screen.getByRole('img', { name: 'Project Graph' });
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: naturalWidth });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: naturalHeight });
  fireEvent.load(image);
  return image;
};

describe('Help images open in a larger viewer', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const openHelp = (markdown: string) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(markdown),
    }) as unknown as typeof fetch;
    render(<DocumentView docType="tutorial" target={target} />);
  };

  it('opens a picture when it is selected and closes it with Close or Escape', async () => {
    const user = userEvent.setup();
    openHelp('# Doc\n\n![Project Graph](tutorials/assets/ui/graph.png)');

    await user.click(await screen.findByRole('button', { name: 'Enlarge image: Project Graph' }));

    const viewer = screen.getByRole('dialog', { name: 'Project Graph' });
    expect(within(viewer).getByRole('img', { name: 'Project Graph' }).getAttribute('src')).toMatch(
      /tutorials\/assets\/ui\/graph\.png$/,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // The keyboard reaches it too: the picture is a button.
    screen.getByRole('button', { name: 'Enlarge image: Project Graph' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Project Graph' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    // Focus goes back to the picture, so the reader keeps their place in Help.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enlarge image: Project Graph' })).toHaveFocus();
    });
  });

  it('leaves an icon set in a line of text as a plain image', async () => {
    openHelp(
      'Please cite <img alt="citemark" src="references/assets/mark_ref.png" style="display: inline; height: 1em;"> the dataset.',
    );

    expect(await screen.findByRole('img', { name: 'citemark' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enlarge image/ })).toBeNull();
  });

  it('gives the zoom keys to the open picture, not to the Help text behind it', async () => {
    const user = userEvent.setup();
    openHelp('# Doc\n\n![Project Graph](tutorials/assets/ui/graph.png)');
    await user.click(await screen.findByRole('button', { name: 'Enlarge image: Project Graph' }));

    fireEvent.keyDown(document.body, { key: '=', metaKey: true });

    expect(screen.getByRole('button', { name: 'Fit to window' }).textContent).toBe('125%');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%');
  });
});

describe('DocImageViewer sizing', () => {
  const image = { src: 'graph.png', alt: 'Project Graph' };
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    reportSize = [];
    globalThis.ResizeObserver = FiredResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('fits a large picture to the window, then enlarges it up to four times', async () => {
    const user = userEvent.setup();
    render(<DocImageViewer image={image} onClose={vi.fn()} />);

    // 2000 x 800 in a 1000 x 600 area: the width decides, so half size.
    const picture = sizeViewer(2000, 800);
    expect(picture.style.width).toBe('1000px');
    expect(screen.getByRole('button', { name: 'Fit to window' }).textContent).toBe('Fit');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(picture.style.width).toBe('1250px');
    expect(picture.style.maxWidth).toBe('none');
    expect(screen.getByRole('button', { name: 'Fit to window' }).textContent).toBe('125%');

    for (let i = 0; i < 20; i += 1)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(picture.style.width).toBe('4000px');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Fit to window' }));
    expect(picture.style.width).toBe('1000px');
  });

  it('opens a small picture at its real size, not stretched to the window', () => {
    render(<DocImageViewer image={image} onClose={vi.fn()} />);

    // Before the window has been measured, CSS alone keeps the picture inside it.
    const picture = screen.getByRole('img', { name: 'Project Graph' });
    expect([picture.style.width, picture.style.maxWidth]).toEqual(['', '100%']);

    expect(sizeViewer(300, 200).style.width).toBe('300px');
  });

  it('moves an enlarged picture when it is dragged', async () => {
    const user = userEvent.setup();
    render(<DocImageViewer image={image} onClose={vi.fn()} />);
    sizeViewer(2000, 800);
    const area = screen.getByTestId('doc-image-viewport');
    area.setPointerCapture = vi.fn();

    // Fitted, there is nothing to move.
    fireEvent.pointerDown(area, { button: 0, clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 400, clientY: 250, pointerId: 1 });
    expect(area.scrollLeft).toBe(0);
    fireEvent.pointerUp(area, { pointerId: 1 });

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.pointerDown(area, { button: 0, clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 400, clientY: 250, pointerId: 1 });
    expect([area.scrollLeft, area.scrollTop]).toEqual([100, 50]);
    fireEvent.pointerUp(area, { pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 300, clientY: 200, pointerId: 1 });
    expect([area.scrollLeft, area.scrollTop]).toEqual([100, 50]);
  });
});
