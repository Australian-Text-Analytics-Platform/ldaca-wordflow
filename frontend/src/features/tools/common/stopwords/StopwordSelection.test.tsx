import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Int32, Utf8 } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '@/features/project/api';
import { StopwordControl } from './StopwordControl';
import type { StopwordSource } from './stopwordData';
import { useStopwords } from './useStopwords';

vi.mock('@/features/project/api', async (original) => ({
  ...(await original<typeof api>()),
  nodeSchema: vi.fn(),
}));
const words: StopwordSource = {
  source: { schema: 'data', name: 'Shared words' },
  column: 'code',
};
const nodes: api.ProjectNode[] = [
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
const consumed = vi.fn();

function mount(initial: StopwordSource | null = null, carried = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
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
        nodes={nodes}
        selected={selected}
        enabled={selected !== null}
        disabled={false}
        controller={controller}
        onSelect={onSelect}
        onEnabledChange={vi.fn()}
        inputRequests={
          carried
            ? {
                pendingInputRequest: { id: 7, nodeId: words.source.name },
                consumeInputRequest: consumed,
              }
            : undefined
        }
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
  vi.mocked(api.nodeSchema).mockResolvedValue([
    { name: 'word', field: new Field('word', new Utf8(), true) },
    { name: 'code', field: new Field('code', new Int32(), true) },
  ]);
});

it('uses the shared searchable Add control, selected card and unrestricted column picker', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add data block' }));
  await user.type(screen.getByPlaceholderText('Search data blocks…'), 'shared');
  await user.click(screen.getByRole('button', { name: 'Shared words' }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Choose the stopword column');
  expect(screen.getByRole('button', { name: 'Remove Shared words' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add data block' })).toBeDisabled();
  await user.click(screen.getByRole('combobox', { name: 'Stopword column' }));
  await user.click(await screen.findByRole('option', { name: 'code', exact: true }));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(words));
  await user.click(screen.getByRole('button', { name: 'Remove Shared words' }));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith(null));
  expect(screen.getByRole('button', { name: 'Add data block' })).toBeEnabled();
});

it('keeps a missing saved column visible and clears the selection without deleting data', async () => {
  mount({ ...words, column: 'removed column' });
  await waitFor(() => expect(api.nodeSchema).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Stopword column' })).toHaveTextContent(
      'removed column',
    ),
  );
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(null));
});

it('places a carried Data Block only after its stopword target is selected', async () => {
  mount(null, true);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to Stopword Data Block' }));
  await screen.findByRole('combobox', { name: 'Stopword column' });
  expect(changed).not.toHaveBeenCalled();
  expect(consumed).toHaveBeenCalledWith(7);
});

it('keeps an incomplete legacy choice local until its column is chosen', async () => {
  mount({ ...words, column: '' });
  expect(screen.getByRole('switch', { name: 'Filter stopwords from results' })).toBeDisabled();
  expect(changed).not.toHaveBeenCalled();
  const user = userEvent.setup();
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
  expect(screen.getByRole('status')).toHaveTextContent('previous applied words are unchanged');
  await user.click(screen.getByRole('combobox', { name: 'Stopword column' }));
  await user.click(await screen.findByRole('option', { name: 'code', exact: true }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(words));
});
