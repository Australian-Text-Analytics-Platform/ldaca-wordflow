import * as projectApi from '@/features/project/api';
import * as filesApi from '@/features/project/filesApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Int32, Utf8 } from 'apache-arrow';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { StopwordControl } from './StopwordControl';
import type { StopwordSource } from './stopwordData';
import { useStopwords } from './useStopwords';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<object>()),
  nodeSchema: vi.fn(),
}));
vi.mock('@/features/project/filesApi', async (original) => ({
  ...(await original<object>()),
  readStopwords: vi.fn().mockResolvedValue(['the', 'and']),
  prepareStopwords: vi.fn(),
}));
const words: StopwordSource = {
  source: { schema: 'data', name: 'Shared words' },
  column: 'code',
};
const nodes: projectApi.ProjectNode[] = [
  {
    table_name: words.source.name,
    visible: true,
    color: null,
    document_column: null,
    kind: 'table',
    column_count: 2,
    can_undo: false,
  },
];
const changed = vi.fn();

function mount(
  initial: StopwordSource | null = null,
  _carried = false,
  initiallyEnabled = true,
  kind: projectApi.ProjectNode['kind'] = 'table',
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [enabled, setEnabled] = useState(initiallyEnabled);
    const [selected, setSelected] = useState(initial);
    const onSelect = async (next: StopwordSource | null) => {
      changed(next);
      setSelected(next);
    };
    const controller = useStopwords({
      base: 'http://project',
      selected,
      inputs: [],
      active: false,
      onSelect,
    });
    return (
      <StopwordControl
        base="http://project"
        nodes={nodes.map((node) => ({ ...node, kind }))}
        selected={selected}
        enabled={enabled}
        disabled={false}
        controller={controller}
        onSelect={onSelect}
        onEnabledChange={setEnabled}
      />
    );
  }
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(filesApi.readStopwords).mockResolvedValue(['the', 'and']);
  vi.mocked(projectApi.nodeSchema).mockResolvedValue([
    { name: 'word', field: new Field('word', new Utf8(), true) },
    { name: 'code', field: new Field('code', new Int32(), true) },
  ]);
});

it('keeps original read diagnostics beside the stopword list and recovers with Retry', async () => {
  vi.mocked(filesApi.readStopwords).mockRejectedValueOnce(
    new Error('Provider retained diagnostic 日本語'),
  );
  mount(words);
  const alert = await screen.findByRole('alert', { name: 'Could not load stopwords' });
  expect(alert).toHaveTextContent('Provider retained diagnostic 日本語');
  expect(alert).toHaveTextContent('Details');
  expect(alert).toHaveTextContent('Copy details');
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry', exact: true }));
  await screen.findByRole('button', { name: 'Remove stopword the' });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('uses the shared searchable Add control, selected card and unrestricted column picker', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add data block' }));
  await user.type(screen.getByPlaceholderText('Search data blocks…'), 'shared');
  await user.click(screen.getByRole('button', { name: 'Shared words' }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText(/previous applied words are unchanged/)).toHaveTextContent(
    'Choose the stopword column',
  );
  expect(screen.getByRole('button', { name: 'Remove Shared words' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add data block' })).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Stopword column' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('combobox', { name: 'Stopword column' }));
  await user.click(await screen.findByRole('option', { name: 'code', exact: true }));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(words));
  await user.click(screen.getByRole('button', { name: 'Remove Shared words' }));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(null));
  expect(screen.getByRole('button', { name: 'Add data block' })).toBeEnabled();
});

it('keeps a missing saved column visible and clears the selection without deleting data', async () => {
  mount({ ...words, column: 'removed column' });
  await waitFor(() => expect(projectApi.nodeSchema).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Stopword column' })).toHaveTextContent(
      'removed column',
    ),
  );
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(null));
});

it('keeps an incomplete legacy choice local until its column is chosen', async () => {
  mount({ ...words, column: '' });
  expect(screen.getByRole('switch', { name: 'Filter stopwords from results' })).toBeEnabled();
  expect(changed).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Stopword column' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('combobox', { name: 'Stopword column' }));
  await user.click(await screen.findByRole('option', { name: 'code', exact: true }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(words));
});

it('retains applied words while a replacement awaits its column', async () => {
  mount(words);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Replace stopword list' }));
  await user.click(screen.getByRole('button', { name: 'Add data block' }));
  await user.click(screen.getByRole('button', { name: 'Shared words' }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText(/previous applied words are unchanged/)).toHaveTextContent(
    'previous applied words are unchanged',
  );
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Stopword column' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('combobox', { name: 'Stopword column' }));
  await user.click(await screen.findByRole('option', { name: 'code', exact: true }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(words));
});

it('hides all content when off and restores the selected list without rewriting it', async () => {
  mount(words, false, false);
  const toggle = screen.getByRole('switch', { name: 'Filter stopwords from results' });
  expect(screen.queryByRole('button', { name: 'Add data block' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Stopword editor')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  await screen.findByRole('button', { name: 'Remove stopword the' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.queryByLabelText('Stopword editor')).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await screen.findByRole('button', { name: 'Remove stopword the' });
  expect(changed).not.toHaveBeenCalled();
});

it('shows View words read-only without implicitly creating an editable Table', async () => {
  mount(words, false, true, 'view');
  await screen.findByText('the');
  expect(screen.queryByRole('textbox', { name: 'Add stopword' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove stopword the' })).not.toBeInTheDocument();
  expect(filesApi.prepareStopwords).not.toHaveBeenCalled();
  const copied = { ...words, source: { schema: 'data', name: 'Editable words' } };
  vi.mocked(filesApi.prepareStopwords).mockResolvedValue(copied);
  fireEvent.click(screen.getByRole('button', { name: 'Create editable copy' }));
  await waitFor(() =>
    expect(filesApi.prepareStopwords).toHaveBeenCalledWith('http://project', words, []),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledWith(copied));
});
