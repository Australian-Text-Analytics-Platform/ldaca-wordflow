import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { WorkflowGuidance } from './WorkflowGuidance';
import { hintsFor, nextHint } from './registry';
import { useModalLayerStore } from './modalLayerStore';
import { ALL_TOOLS } from '@/features/tools/toolIds';
import { acceptPreferences, defaultPreferences } from '@/features/preferences/preferences';
const patch = vi.hoisted(() => vi.fn());
vi.mock('@/features/preferences/preferences', async (load) => ({
  ...(await load<object>()),
  patchPreferences: patch,
}));
beforeEach(() => {
  patch.mockReset().mockResolvedValue(undefined);
  acceptPreferences(defaultPreferences);
  useModalLayerStore.setState({ count: 0 });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 100,
    left: 100,
    top: 100,
    right: 200,
    bottom: 130,
    width: 100,
    height: 30,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function View({
  tool = 'data-loader',
  blocked = false,
  target = true,
  editing = false,
  pending = false,
  dialog = false,
}: {
  tool?: 'data-loader' | 'export';
  blocked?: boolean;
  target?: boolean;
  editing?: boolean;
  pending?: boolean;
  dialog?: boolean;
}) {
  return (
    <>
      <div data-guidance-tool={tool} data-guidance-editing={editing}>
        <input aria-label="Draft" />
        {pending && <div data-guidance-pending="true">Predicting this page…</div>}
        <button data-guidance-stage={target ? 'setup' : undefined}>Set up</button>
        <button data-guidance-stage="action" disabled>
          Unavailable action
        </button>
      </div>
      {dialog && <div role="dialog">Choose a Data Block</div>}
      <WorkflowGuidance tool={tool} blocked={blocked} />
    </>
  );
}
function setup(props: Parameters<typeof View>[0] = {}) {
  const client = new QueryClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <View {...props} />
      </QueryClientProvider>,
    ),
  };
}
it('covers all nine tools and only selects eligible, unacknowledged versions', () => {
  for (const tool of ALL_TOOLS)
    expect(hintsFor(tool).map((hint) => hint.stage)).toEqual([
      'setup',
      'action',
      'results',
      'followup',
    ]);
  const stages = new Set(['setup', 'results'] as const);
  expect(nextHint('export', stages, { 'export.setup': 1 }, false, true)?.id).toBe('export.results');
  expect(nextHint('export', stages, { 'export.setup': 0 }, false, true)?.id).toBe('export.setup');
  expect(nextHint('export', stages, {}, true, true)).toBeUndefined();
  expect(nextHint('export', stages, {}, false, false)).toBeUndefined();
  expect(hintsFor('data-loader', 'manual', false)[1]?.body).toContain('imports them immediately');
  expect(hintsFor('data-loader', 'manual', true)[1]?.body).toContain('Click Import beside a file');
});
it('keeps focus and workspace shortcuts untouched when Driver.js dismisses on Escape', async () => {
  const user = userEvent.setup();
  setup();
  const hint = await screen.findByRole('complementary');
  expect(hint).toBeVisible();
  expect(document.activeElement).toBe(document.body);
  const shortcut = vi.fn();
  window.addEventListener('keydown', shortcut);
  try {
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(shortcut.mock.calls[0][0].defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(patch).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', shortcut);
  }
});
it('keeps a navigation click from dismissing the next tool hint and cleans up its highlight', async () => {
  const user = userEvent.setup();
  function Navigation() {
    const [tool, setTool] = useState<'data-loader' | 'export'>('data-loader');
    return (
      <>
        <button onClick={() => setTool('export')}>Go to Export</button>
        <View tool={tool} />
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Navigation />
    </QueryClientProvider>,
  );
  await screen.findByRole('complementary', { name: 'Choose a data source' });
  const previous = screen.getByRole('button', { name: 'Set up' });
  expect(previous).toHaveAttribute('data-guidance-highlighted', 'true');
  await user.click(screen.getByRole('button', { name: 'Go to Export' }));
  await screen.findByRole('complementary', { name: 'Choose what to export' });
  expect(screen.getByRole('button', { name: 'Go to Export' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Set up' })).toHaveAttribute(
    'data-guidance-highlighted',
    'true',
  );
  await user.click(await screen.findByRole('button', { name: 'Not now' }));
  expect(screen.getByRole('button', { name: 'Set up' })).not.toHaveAttribute(
    'data-guidance-highlighted',
  );
});
it('defers on hint Escape without acknowledgment and shows hints again on the next tool visit', async () => {
  const user = userEvent.setup();
  const client = new QueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
  await screen.findByRole('complementary');
  await user.click(await screen.findByRole('button', { name: 'Got it' }));
  expect(patch).toHaveBeenCalledWith({
    guidance: { acknowledge: { id: 'data-loader.setup', version: 1 } },
  });
  patch.mockClear();
  await screen.findByRole('complementary');
  await user.click(await screen.findByRole('button', { name: 'Dismiss hint' }));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  view.rerender(
    <QueryClientProvider client={client}>
      <View tool="export" />
    </QueryClientProvider>,
  );
  await screen.findByRole('complementary');
  await user.click(await screen.findByRole('button', { name: 'Not now' }));
  view.rerender(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
  await screen.findByRole('complementary');
  const inside = screen.getByRole('button', { name: 'Got it' });
  act(() => inside.focus());
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(patch).not.toHaveBeenCalled();
});
it('suppresses modal, editing and pending-operation hints and ignores missing or disabled targets', async () => {
  const { rerender, client } = setup({ blocked: true });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  rerender(
    <QueryClientProvider client={client}>
      <View target={false} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  rerender(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
  await screen.findByRole('complementary');
  act(() => useModalLayerStore.setState({ count: 1 }));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  act(() => useModalLayerStore.setState({ count: 0 }));
  await screen.findByRole('complementary');
  rerender(
    <QueryClientProvider client={client}>
      <View editing />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
});
it('saves Disable hints through preferences and preserves input focus while typing', async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByRole('complementary');
  await user.click(await screen.findByRole('button', { name: 'Disable hints' }));
  expect(patch).toHaveBeenCalledWith({ guidance: { enabled: false } });
  await user.click(screen.getByRole('textbox', { name: 'Draft' }));
  await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'unchanged focus');
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveFocus();
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
it('suppresses request-scoped prediction and unregistered dialogs until they finish', async () => {
  const { rerender, client } = setup({ pending: true });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  rerender(
    <QueryClientProvider client={client}>
      <View dialog />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  rerender(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
  await screen.findByRole('complementary');
});
it('uses visible external workflow anchors and ignores aria-hidden targets', async () => {
  acceptPreferences({
    ...defaultPreferences,
    guidance: { enabled: true, acknowledgments: { 'data-loader.setup': 1 } },
  });
  const { client, rerender } = setup();
  const tree = (hidden: boolean) => (
    <QueryClientProvider client={client}>
      <View />
      <aside aria-hidden={hidden}>
        <button data-guidance-for="data-loader" data-guidance-stage="results">
          Project Graph
        </button>
      </aside>
    </QueryClientProvider>
  );
  rerender(tree(true));
  await waitFor(() =>
    expect(
      screen.queryByRole('complementary', { name: 'Find your Data Blocks' }),
    ).not.toBeInTheDocument(),
  );
  rerender(tree(false));
  await screen.findByRole('complementary', { name: 'Find your Data Blocks' });
});
it('resumes an unacknowledged hint when a temporarily unavailable target returns after resize', async () => {
  setup();
  await screen.findByRole('button', { name: 'Got it' });
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  const original = {
    x: 100,
    y: 100,
    left: 100,
    top: 100,
    right: 200,
    bottom: 130,
    width: 100,
    height: 30,
    toJSON: () => ({}),
  };
  rect.mockReturnValue({ ...original, y: 2000, top: 2000, bottom: 2030 });
  await act(() => window.dispatchEvent(new Event('resize')));
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  rect.mockReturnValue(original);
  await act(() => window.dispatchEvent(new Event('resize')));
  await screen.findByRole('button', { name: 'Got it' });
  expect(screen.getByRole('button', { name: 'Set up' })).toHaveAttribute(
    'data-guidance-highlighted',
    'true',
  );
  expect(patch).not.toHaveBeenCalled();
});
it('reopens Driver visibility closures without treating them as user dismissal', async () => {
  let notify!: IntersectionObserverCallback;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  setup();
  await screen.findByRole('button', { name: 'Got it' });
  await act(async () => {
    notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  await act(async () => {
    notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
  await screen.findByRole('button', { name: 'Got it' });
  expect(patch).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Set up' }));
  await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
});
