import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { APOLLO_CONFIGURATION_ID } from '../apolloProvider';

vi.mock('@/features/provider-credentials/useProviderCredentials', () => ({
  useProviderCredentials: () => ({
    storage: 'browser',
    isLoading: false,
    error: null,
    annotationProviders: [
      {
        id: APOLLO_CONFIGURATION_ID,
        name: 'Apollo LLM',
        provider: 'custom',
        base_url: 'https://apollo-llm.invalid/v1',
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

import { AiProvidersPreferencesPanel } from '@/features/views/annotation/components/AiProvidersPreferencesPanel';

describe('Apollo LLM in Settings (deploy/apollo)', () => {
  it('is read-only and never shows the placeholder URL', () => {
    render(<AiProvidersPreferencesPanel />);

    expect(screen.getByText('Apollo LLM')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Provided by this server')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByText(/apollo-llm\.invalid/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear all providers' })).toBeDisabled();
  });
});
