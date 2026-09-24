import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataPortalRecord } from '@/api';
import {
  listDataPortalCollectionsWithProviderCredential,
  submitDataPortalImportWithProviderCredential,
} from '@/features/provider-credentials/providerCredentialRequests';
import { useLdacaImport } from '../useLdacaImport';

vi.mock('@/features/provider-credentials/providerCredentialRequests', () => ({
  listDataPortalCollectionsWithProviderCredential: vi.fn(),
  submitDataPortalImportWithProviderCredential: vi.fn(),
}));

const record: DataPortalRecord = {
  id: 'arcp://name,hdl10.26180~23961609',
  crate_id: 'arcp://name,hdl10.26180~23961609',
  title: 'A COrpus of Oz Early English (COOEE)',
  description: 'Historical English corpus',
  types: ['Dataset'],
  license: 'https://creativecommons.org/licenses/by/4.0/',
  importable: true,
  collections: ['arcp://name,hdl10.26180~23961609'],
  file_formats: ['text/plain'],
};

const importResource = {
  id: 'import-1',
  state: 'queued' as const,
  request: { kind: 'data_portal' as const, identifier: record.id },
  progress: { fraction: 0, message: 'Queued' },
  error: null,
  cancellation_requested_at: null,
  created_at: '2026-01-01T00:00:00Z',
  started_at: null,
  finished_at: null,
  revision: 1,
  result: null,
};

describe('useLdacaImport', () => {
  const notify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDataPortalCollectionsWithProviderCredential).mockResolvedValue({
      data: { items: [record], page: 1, page_size: 1, total: 1 },
      error: undefined,
    });
    vi.mocked(submitDataPortalImportWithProviderCredential).mockResolvedValue({
      data: importResource,
      error: undefined,
    });
  });

  it('lists every collection when the dialog opens and re-checks after a token change', async () => {
    const { result } = renderHook(() => useLdacaImport({ notify }));
    act(() => result.current.setLdacaImportOpen(true));
    await waitFor(() => expect(result.current.collections).toEqual([record]));
    expect(listDataPortalCollectionsWithProviderCredential).toHaveBeenCalledTimes(1);

    act(() => result.current.setLdacaImportOpen(false));
    act(() => result.current.setLdacaImportOpen(true));
    expect(listDataPortalCollectionsWithProviderCredential).toHaveBeenCalledTimes(1);

    await act(async () => result.current.reloadCollections());
    expect(listDataPortalCollectionsWithProviderCredential).toHaveBeenCalledTimes(2);
  });

  it('imports a whole collection, or its metadata only, and closes the dialog', async () => {
    const { result } = renderHook(() => useLdacaImport({ notify }));
    act(() => result.current.setLdacaImportOpen(true));
    await act(async () => result.current.handleLdacaImport(record.id));
    expect(submitDataPortalImportWithProviderCredential).toHaveBeenLastCalledWith({
      identifier: record.id,
      metadata_only: false,
    });
    expect(notify).toHaveBeenCalledWith('success', 'LDaCA import queued.');
    expect(result.current.ldacaImportOpen).toBe(false);

    await act(async () => result.current.handleLdacaImport(record.id, true));
    expect(submitDataPortalImportWithProviderCredential).toHaveBeenLastCalledWith({
      identifier: record.id,
      metadata_only: true,
    });
    expect(notify).toHaveBeenCalledWith('success', 'LDaCA metadata import queued.');
  });
});
