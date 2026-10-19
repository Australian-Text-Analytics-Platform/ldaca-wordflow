import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/provider-credentials/useProviderCredentials', () => ({
  useProviderCredentials: () => ({
    storage: 'browser',
    isLoading: false,
    error: null,
    annotationProviders: [
      {
        id: '3c4d70f7-4c43-5e66-9f39-6a4b478319bc',
        name: 'Apollo LLM',
        provider: 'custom',
        base_url: 'https://apollo.server-ai.invalid/v1',
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

describe('a server AI provider in Settings (issue 411)', () => {
  it('is read-only and never shows its placeholder address', () => {
    render(<AiProvidersPreferencesPanel />);

    expect(screen.getByText('Apollo LLM')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Provided by this server')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByText(/server-ai\.invalid/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear all providers' })).toBeDisabled();
  });
});
