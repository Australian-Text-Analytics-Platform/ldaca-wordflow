import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listAnnotationModelsWithProviderCredential } from '@/features/provider-credentials/providerCredentialRequests';
import { useProviderCredentialsStore } from '@/features/provider-credentials/providerCredentialsStore';
import { useProviderCredentials } from '@/features/provider-credentials/useProviderCredentials';
import { AnnotationRunAllSettings } from '@/features/views/annotation/components/inference-settings/AnnotationRunAllSettings';
import { useAuthStore } from '@/stores/authStore';
import {
  capServerAiConcurrency,
  isServerAiConfiguration,
  type ServerAiProvider,
  serverAiConcurrencyLimit,
  serverAiDefaultModels,
} from '../serverAiProviders';

const RESEARCH_ID = '5b0d6e2a-8f43-4c1e-9a7d-2c3b4e5f6a71';

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isMultiUserMode: true, user: { id: 'user-a' } },
  listServerAiProviders: vi.fn(),
  getProviderCredentials: vi.fn(),
  listAnnotationModels: vi.fn(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  listServerAiProviders: mocks.listServerAiProviders,
  getProviderCredentials: mocks.getProviderCredentials,
  listAnnotationModels: mocks.listAnnotationModels,
}));

const research: ServerAiProvider = {
  configuration: {
    id: RESEARCH_ID,
    name: 'Research LLM',
    provider: 'custom',
    base_url: 'https://research.server-ai.invalid/v1',
    has_api_key: true,
  },
  default_model: 'qwen3-32b',
  max_requests_per_user: 1,
};

const campus: ServerAiProvider = {
  configuration: {
    id: '9d1c1f5e-0d6c-5b6e-9a51-7f1f7d2f3a10',
    name: 'Campus LLM',
    provider: 'custom',
    base_url: 'https://campus.server-ai.invalid/v1',
    has_api_key: true,
  },
  default_model: null,
  max_requests_per_user: null,
};

const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('server AI providers (issue 411)', () => {
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

  it('lists the server providers first, in order, read-only and without a key', async () => {
    mocks.listServerAiProviders.mockResolvedValue({ data: { providers: [research, campus] } });
    useProviderCredentialsStore.getState().addAnnotationProvider('user-a', {
      name: 'My OpenAI',
      provider: 'openai',
      apiKey: 'sk-mine',
    });

    const { result } = renderHook(() => useProviderCredentials(), { wrapper });

    await waitFor(() => {
      expect(result.current.annotationProviders).toHaveLength(3);
    });
    expect(result.current.annotationProviders.map((item) => item.name)).toEqual([
      'Research LLM',
      'Campus LLM',
      'My OpenAI',
    ]);
    const [first] = result.current.annotationProviders;
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ['base_url', 'credentialRevision', 'has_api_key', 'id', 'name', 'provider'].sort(),
    );
  });

  it('lists nothing extra when the server offers none', async () => {
    mocks.listServerAiProviders.mockResolvedValue({ data: { providers: [] } });
    const { result } = renderHook(() => useProviderCredentials(), { wrapper });
    await waitFor(() => {
      expect(mocks.listServerAiProviders).toHaveBeenCalled();
    });
    expect(result.current.annotationProviders).toEqual([]);
  });

  it('never sends an API key for a server provider', async () => {
    useAuthStore.setState({
      session: {
        mode: 'multi_user',
        authenticated: true,
        user: { id: 'user-a', email: 'a@uni.edu', name: 'A' },
      },
    } as never);
    mocks.listAnnotationModels.mockResolvedValue({ data: { models: [] } });

    await listAnnotationModelsWithProviderCredential(research.configuration);

    const body = mocks.listAnnotationModels.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('api_key');
    expect(body.provider_configuration_id).toBe(RESEARCH_ID);
  });

  it('knows server providers by their placeholder address', () => {
    expect(isServerAiConfiguration(research.configuration)).toBe(true);
    expect(isServerAiConfiguration({ base_url: 'http://localhost:7888/v1' })).toBe(false);
    expect(isServerAiConfiguration({ base_url: null })).toBe(false);
  });

  it('caps requests at once to the provider limit and fills its default model', () => {
    expect(capServerAiConcurrency([research, campus], RESEARCH_ID, 8)).toBe(1);
    expect(capServerAiConcurrency([research, campus], campus.configuration.id, 8)).toBe(8);
    expect(serverAiConcurrencyLimit([research], RESEARCH_ID)?.note).toBe(
      'Research LLM takes one request at a time for each person, so Run sends at most one request at once.',
    );
    expect(serverAiDefaultModels([research, campus])).toEqual({
      [RESEARCH_ID]: 'qwen3-32b',
    });
    expect(serverAiDefaultModels(undefined)).toEqual({});
  });

  it('shows the limit note and does not allow more', () => {
    const limit = serverAiConcurrencyLimit([research], RESEARCH_ID);
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
        maxConcurrencyLimit={limit}
        onMaxConcurrencyCommit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Requests at once');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('max', '1');
    expect(screen.getByText(limit?.note ?? 'missing')).toBeInTheDocument();
  });
});
