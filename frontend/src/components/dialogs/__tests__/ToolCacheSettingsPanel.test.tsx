import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToolCacheSettingsPanel } from '../ToolCacheSettingsPanel';

const clearCache = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({ toast: { success: (message: string) => toastSuccess(message) } }));

vi.mock('@/api', () => ({
  listToolCachesQueryKey: () => ['tool-caches'],
  listToolCachesOptions: () => ({
    queryKey: ['tool-caches'],
    queryFn: () =>
      Promise.resolve({
        caches: [
          { kind: 'topic_modeling', size_bytes: 52_428_800 },
          { kind: 'tokeniser', size_bytes: 0 },
        ],
      }),
  }),
  clearUserToolCacheMutation: () => ({
    mutationFn: (options: { path: { kind: string } }) => {
      clearCache(options.path.kind);
      return Promise.resolve({ kind: options.path.kind, freed_bytes: 52_428_800 });
    },
  }),
}));

const renderPanel = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToolCacheSettingsPanel />
    </QueryClientProvider>,
  );

describe('ToolCacheSettingsPanel', () => {
  it('lists each cache with its size and keeps an empty one unclearable', async () => {
    renderPanel();

    const topic = await screen.findByTestId('tool-cache-topic_modeling');
    expect(topic).toHaveTextContent('Topic Modelling 50 MB');
    const tokeniser = screen.getByTestId('tool-cache-tokeniser');
    expect(tokeniser).toHaveTextContent('Tokeniser Empty');
    expect(within(tokeniser).getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('asks before clearing, then reports the space freed', async () => {
    renderPanel();
    const topic = await screen.findByTestId('tool-cache-topic_modeling');

    fireEvent.click(within(topic).getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/Clear 50 MB\? The next Topic Modelling run/)).toBeInTheDocument();
    expect(clearCache).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Topic Modelling cache' }));
    await waitFor(() => {
      expect(clearCache).toHaveBeenCalledWith('topic_modeling');
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Cleared 50 MB from the Topic Modelling cache.');
    });
  });
});
