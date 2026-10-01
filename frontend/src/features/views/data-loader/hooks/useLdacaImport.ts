import { useEffect, useReducer, type Dispatch } from 'react';
import {
  listDataPortalCollectionsWithProviderCredential,
  submitDataPortalImportWithProviderCredential,
} from '@/features/provider-credentials/providerCredentialRequests';
import {
  initialLdacaImportState,
  ldacaImportReducer,
  type LdacaImportAction,
} from './ldacaImportState';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';

type Notify = (
  type: 'success' | 'error' | 'info',
  message: string,
  description?: string,
  cause?: unknown,
) => void;

interface UseLdacaImportParams {
  notify: Notify;
}

/** Fetches the collection list with the current token's access. */
async function fetchCollections(dispatch: Dispatch<LdacaImportAction>, notify: Notify) {
  dispatch({ type: 'collectionsStarted' });
  try {
    const { data } = await listDataPortalCollectionsWithProviderCredential();
    dispatch({ type: 'collectionsSucceeded', collections: data.items });
  } catch (error) {
    const message = (error as Error).message || "Couldn't load LDaCA collections.";
    dispatch({ type: 'collectionsFailed', message });
    notify('error', message);
  }
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
    await fetchCollections(dispatch, notify);
  };

  // The token is changed in Settings > Portal (issue 249): re-check access
  // straight away while the dialog is open, otherwise on its next open.
  const dialogOpen = state.ldacaImportOpen;
  useEffect(
    () =>
      useSettingsDialogStore.subscribe((current, previous) => {
        if (current.portalTokenRevision === previous.portalTokenRevision) return;
        dispatch({ type: 'collectionsInvalidated' });
        if (dialogOpen) void fetchCollections(dispatch, notify);
      }),
    [dialogOpen, notify],
  );

  const setLdacaImportOpen = (open: boolean) => {
    dispatch({ type: 'setOpen', open });
    if (open) void loadCollections();
  };

  const setFilter = (filter: string) => {
    dispatch({ type: 'setFilter', filter });
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
      notify('error', "Couldn't start LDaCA import.", undefined, error);
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
    importingId: state.importingId,
    ldacaImporting: Boolean(state.importingId),
    errorMessage: state.errorMessage,
    handleLdacaImport,
  };
}
