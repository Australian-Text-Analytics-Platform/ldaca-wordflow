import { useReducer } from 'react';
import {
  listDataPortalCollectionsWithProviderCredential,
  submitDataPortalImportWithProviderCredential,
} from '@/features/provider-credentials/providerCredentialRequests';
import { initialLdacaImportState, ldacaImportReducer } from './ldacaImportState';

type Notify = (type: 'success' | 'error' | 'info', message: string) => void;

interface UseLdacaImportParams {
  notify: Notify;
}

/**
 * Owns the LDaCA collection import workflow for the Data Loader: every
 * top-level collection is listed when the dialog opens (with access for the
 * current API token), filtered locally, and imported in full or as metadata
 * only. Used by `DataLoaderFeature` to feed `LdacaImportDialog`.
 */
export function useLdacaImport({ notify }: UseLdacaImportParams) {
  const [state, dispatch] = useReducer(ldacaImportReducer, initialLdacaImportState);

  const loadCollections = async (force = false) => {
    if (state.collectionsLoading || (!force && state.collectionsLoaded)) return;
    dispatch({ type: 'collectionsStarted' });
    try {
      const { data } = await listDataPortalCollectionsWithProviderCredential();
      dispatch({ type: 'collectionsSucceeded', collections: data.items });
    } catch (error) {
      const message = (error as Error).message || 'Failed to load LDaCA collections.';
      dispatch({ type: 'collectionsFailed', message });
      notify('error', message);
    }
  };

  /** Re-checks access after the API token changes. */
  const reloadCollections = async () => {
    dispatch({ type: 'collectionsInvalidated' });
    await loadCollections(true);
  };

  const setLdacaImportOpen = (open: boolean) => {
    dispatch({ type: 'setOpen', open });
    if (open) void loadCollections();
  };

  const setFilter = (filter: string) => {
    dispatch({ type: 'setFilter', filter });
  };

  const setTokenPanelOpen = (open: boolean) => {
    dispatch({ type: 'setTokenPanelOpen', open });
  };

  /**
   * Starts a background import of one collection. `metadataOnly` imports one
   * row per object without text, for collections the token cannot read.
   */
  const handleLdacaImport = async (recordId: string, metadataOnly = false) => {
    dispatch({ type: 'importStarted', importingId: recordId });
    try {
      const { data } = await submitDataPortalImportWithProviderCredential({
        identifier: recordId,
        metadata_only: metadataOnly,
      });
      notify(
        'success',
        metadataOnly ? `LDaCA metadata import ${data.state}.` : `LDaCA import ${data.state}.`,
      );
      dispatch({ type: 'importSucceeded' });
    } catch (error) {
      notify('error', (error as Error).message || 'Failed to start LDaCA import.');
    } finally {
      dispatch({ type: 'importFinished' });
    }
  };

  return {
    ldacaImportOpen: state.ldacaImportOpen,
    setLdacaImportOpen,
    filter: state.filter,
    setFilter,
    collections: state.collections,
    collectionsLoading: state.collectionsLoading,
    reloadCollections,
    tokenPanelOpen: state.tokenPanelOpen,
    setTokenPanelOpen,
    importingId: state.importingId,
    ldacaImporting: Boolean(state.importingId),
    errorMessage: state.errorMessage,
    handleLdacaImport,
  };
}
