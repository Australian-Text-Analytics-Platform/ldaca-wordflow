import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ServerAiProvidersModule from '@/features/server-ai-providers/serverAiProviders';

const RESEARCH_ID = '5b0d6e2a-8f43-4c1e-9a7d-2c3b4e5f6a71';
const defaults = vi.hoisted(() => ({ models: {} as Record<string, string> }));
const mutate = vi.hoisted(() => vi.fn());

vi.mock('@/features/provider-credentials/useProviderCredentials', () => ({
  useProviderCredentials: () => ({
    storage: 'browser',
    isLoading: false,
    error: null,
    annotationProviders: [
      {
        id: '5b0d6e2a-8f43-4c1e-9a7d-2c3b4e5f6a71',
        name: 'Research LLM',
        provider: 'custom',
        base_url: 'https://research.server-ai.invalid/v1',
        has_api_key: true,
        credentialRevision: 1,
      },
    ],
    updateAnnotationProvider: vi.fn(),
    deleteAnnotationProvider: vi.fn(),
    clearAnnotationProviders: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@/features/preferences/useAiDefaultModels', () => ({
  useAiDefaultModels: () => defaults.models,
  useSetAiDefaultModel: () => ({ mutate, isPending: false }),
}));

vi.mock('@/features/server-ai-providers/serverAiProviders', async (importOriginal) => ({
  ...(await importOriginal<typeof ServerAiProvidersModule>()),
  useServerAiProviders: () => [
    {
      configuration: {
        id: '5b0d6e2a-8f43-4c1e-9a7d-2c3b4e5f6a71',
        name: 'Research LLM',
        provider: 'custom',
        base_url: 'https://research.server-ai.invalid/v1',
        has_api_key: true,
      },
      default_model: 'qwen3-32b',
      max_requests_per_user: null,
    },
  ],
}));

import { AiProvidersPreferencesPanel } from '@/features/views/annotation/components/AiProvidersPreferencesPanel';

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiProvidersPreferencesPanel />
    </QueryClientProvider>,
  );

describe('a server AI provider in Settings (issue 411)', () => {
  beforeEach(() => {
    defaults.models = {};
    mutate.mockReset();
  });

  it('is read-only and never shows its placeholder address', () => {
    renderPanel();

    expect(screen.getByText('Research LLM')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Provided by this Wordflow server')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByText(/server-ai\.invalid/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear all providers' })).toBeDisabled();
  });

  it('may leave the default model empty, naming the server default', () => {
    renderPanel();

    expect(screen.getByLabelText('Default model')).toHaveValue('');
    expect(
      screen.getByText(
        "Empty: Annotation starts with this server's default, qwen3-32b, until a Project uses another model.",
      ),
    ).toBeInTheDocument();
  });

  it('saves a default model when the field is left; an unchanged empty field saves nothing', () => {
    renderPanel();
    const field = screen.getByLabelText('Default model');

    fireEvent.change(field, { target: { value: ' llama-4 ' } });
    fireEvent.blur(field);
    expect(mutate).toHaveBeenCalledWith(
      { configurationId: RESEARCH_ID, model: 'llama-4' },
      expect.anything(),
    );

    mutate.mockReset();
    fireEvent.blur(field, { target: { value: '' } });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows a saved default', () => {
    defaults.models = { [RESEARCH_ID]: 'llama-4' };
    renderPanel();

    expect(screen.getByLabelText('Default model')).toHaveValue('llama-4');
    expect(
      screen.getByText(
        'New Annotation tabs start with this model, unless the Project has used another one.',
      ),
    ).toBeInTheDocument();
  });
});
