import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import type * as GeneratedClient from '@/api/generated/client.gen';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProviderCredentials } from '@/features/provider-credentials/useProviderCredentials';
import { useProviderCredentialsStore } from '@/features/provider-credentials/providerCredentialsStore';
import { listAnnotationModelsWithProviderCredential } from '@/features/provider-credentials/providerCredentialRequests';
import { ModelNameCombobox } from '@/features/views/annotation/components/ModelNameCombobox';
import { AnnotationRunAllSettings } from '@/features/views/annotation/components/inference-settings/AnnotationRunAllSettings';
import { useAnnotationTabSettings } from '@/features/views/annotation/hooks/useAnnotationTabSettings';
import {
  ANNOTATION_TAB_SETTINGS_KEY,
  DEFAULT_ANNOTATION_TAB_SETTINGS,
} from '@/features/views/annotation/annotationTabSettings';
import { useAuthStore } from '@/stores/authStore';
import {
  APOLLO_CONCURRENCY_NOTE,
  APOLLO_CONFIGURATION_ID,
  type ApolloProvider,
  capApolloConcurrency,
} from '../apolloProvider';

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isMultiUserMode: true, user: { id: 'user-a' } },
  clientGet: vi.fn(),
  getProviderCredentials: vi.fn(),
  listAnnotationModels: vi.fn(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/api/generated/client.gen', async (importOriginal) => {
  const original: typeof GeneratedClient = await importOriginal();
  return { ...original, client: { ...original.client, get: mocks.clientGet } };
});
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getProviderCredentials: mocks.getProviderCredentials,
  listAnnotationModels: mocks.listAnnotationModels,
}));

const apollo: ApolloProvider = {
  enabled: true,
  configuration: {
    id: APOLLO_CONFIGURATION_ID,
    name: 'Apollo LLM',
    provider: 'custom',
    base_url: 'https://apollo-llm.invalid/v1',
    has_api_key: true,
  },
  default_model: 'qwen3-32b',
  max_concurrency: 1,
};

const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('Apollo LLM provider (deploy/apollo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useProviderCredentialsStore.setState({ byUser: {} });
    mocks.getProviderCredentials.mockResolvedValue({
      data: {
        storage: 'browser',
        annotation_providers: null,
        data_portal: { user_configured: null, deployment_configured: false },
      },
    });
  });

  it('lists Apollo first, read-only and without a key, for every signed-in user', async () => {
    mocks.clientGet.mockResolvedValue({ data: apollo });
    useProviderCredentialsStore.getState().addAnnotationProvider('user-a', {
      name: 'My OpenAI',
      provider: 'openai',
      apiKey: 'sk-mine',
    });

    const { result } = renderHook(() => useProviderCredentials(), { wrapper });

    await waitFor(() => {
      expect(result.current.annotationProviders).toHaveLength(2);
    });
    const [first, second] = result.current.annotationProviders;
    expect(first).toMatchObject({ id: APOLLO_CONFIGURATION_ID, name: 'Apollo LLM' });
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ['base_url', 'credentialRevision', 'has_api_key', 'id', 'name', 'provider'].sort(),
    );
    expect(second?.name).toBe('My OpenAI');
    expect(mocks.clientGet).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/apollo/provider' }),
    );
  });

  it('lists nothing extra when the server has no Apollo provider', async () => {
    mocks.clientGet.mockResolvedValue({
      data: { enabled: false, configuration: null, default_model: null, max_concurrency: 1 },
    });
    const { result } = renderHook(() => useProviderCredentials(), { wrapper });
    await waitFor(() => {
      expect(mocks.clientGet).toHaveBeenCalled();
    });
    expect(result.current.annotationProviders).toEqual([]);
  });

  it('never sends an API key for Apollo', async () => {
    useAuthStore.setState({
      session: {
        mode: 'multi_user',
        authenticated: true,
        user: { id: 'user-a', email: 'a@uni.edu', name: 'A' },
      },
    } as never);
    mocks.listAnnotationModels.mockResolvedValue({ data: { models: [] } });
    if (!apollo.configuration) throw new Error('missing configuration');

    await listAnnotationModelsWithProviderCredential(apollo.configuration);

    const body = mocks.listAnnotationModels.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('api_key');
    expect(body.provider_configuration_id).toBe(APOLLO_CONFIGURATION_ID);
  });

  it('defaults and caps Requests at once to 1 for Apollo', () => {
    const { result } = renderHook(() =>
      useAnnotationTabSettings({
        onTabSettingChange: vi.fn(),
        tabSettings: {
          [ANNOTATION_TAB_SETTINGS_KEY]: JSON.stringify({
            ...DEFAULT_ANNOTATION_TAB_SETTINGS,
            aiProviderConfigurationId: APOLLO_CONFIGURATION_ID,
            aiProviderType: 'custom',
            aiProviderConcurrency: { [APOLLO_CONFIGURATION_ID]: 8 },
          }),
        },
      }),
    );
    expect(result.current.aiMaxConcurrency).toBe(1);
    expect(capApolloConcurrency('another-provider', 8)).toBe(8);
  });

  it('shows each model with its description and selects the model id', async () => {
    mocks.clientGet.mockResolvedValue({
      data: {
        models: [
          { id: 'qwen3-32b', description: 'Fastest; good for large runs.' },
          { id: 'llama-3.3-70b', description: null },
        ],
      },
    });
    const onChange = vi.fn();
    if (!apollo.configuration) throw new Error('missing configuration');
    render(
      <ModelNameCombobox
        configuration={{ ...apollo.configuration, credentialRevision: 1 }}
        value=""
        onChange={onChange}
      />,
      { wrapper },
    );

    fireEvent.focus(screen.getByPlaceholderText('Search or type a model name'));

    const description = await screen.findByText('Fastest; good for large runs.');
    expect(description).toBeInTheDocument();
    expect(mocks.clientGet).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/apollo/models' }),
    );
    expect(mocks.listAnnotationModels).not.toHaveBeenCalled();
    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'qwen3-32bFastest; good for large runs.',
      'llama-3.3-70b',
    ]);
    expect(rows[0]).toHaveAttribute('title', 'Fastest; good for large runs.');
    fireEvent.click(rows[0] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('qwen3-32b');
  });

  it('shows the one-at-a-time note and does not allow more', () => {
    render(
      <AnnotationRunAllSettings
        maxRetriesPerBatch={2}
        onMaxRetriesPerBatchCommit={vi.fn()}
        batchSize={20}
        onBatchSizeCommit={vi.fn()}
        processingMode="fill_missing"
        onProcessingModeChange={vi.fn()}
        maxConcurrency={1}
        defaultMaxConcurrency={1}
        maxConcurrencyLimit={{ value: 1, note: APOLLO_CONCURRENCY_NOTE }}
        onMaxConcurrencyCommit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Requests at once');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('max', '1');
    expect(screen.getByText(APOLLO_CONCURRENCY_NOTE)).toBeInTheDocument();
  });
});
