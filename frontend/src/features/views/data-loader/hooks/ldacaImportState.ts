import type { OniSearchResult as LdacaCollection } from '@/api';

export interface LdacaImportState {
  ldacaImportOpen: boolean;
  /** Local text filter over the listed collections (issue 135). */
  filter: string;
  collections: LdacaCollection[];
  collectionsLoaded: boolean;
  collectionsLoading: boolean;
  /** Shows the inline API token panel from a restricted row. */
  tokenPanelOpen: boolean;
  importingId: string | undefined;
  errorMessage: string | undefined;
}

type LdacaImportAction =
  | { type: 'setOpen'; open: boolean }
  | { type: 'setFilter'; filter: string }
  | { type: 'setTokenPanelOpen'; open: boolean }
  | { type: 'collectionsInvalidated' }
  | { type: 'collectionsStarted' }
  | { type: 'collectionsSucceeded'; collections: LdacaCollection[] }
  | { type: 'collectionsFailed'; message: string }
  | { type: 'importStarted'; importingId: string }
  | { type: 'importSucceeded' }
  | { type: 'importFinished' };

export const initialLdacaImportState: LdacaImportState = {
  ldacaImportOpen: false,
  filter: '',
  collections: [],
  collectionsLoaded: false,
  collectionsLoading: false,
  tokenPanelOpen: false,
  importingId: undefined,
  errorMessage: undefined,
};

/**
 * Owns the LDaCA import dialog's state transitions: the collection list
 * loaded on open (and again after a token change), the local filter, the
 * inline token panel, and the one running import.
 */
export function ldacaImportReducer(
  state: LdacaImportState,
  action: LdacaImportAction,
): LdacaImportState {
  switch (action.type) {
    case 'setOpen':
      return { ...state, ldacaImportOpen: action.open };
    case 'setFilter':
      return { ...state, filter: action.filter };
    case 'setTokenPanelOpen':
      return { ...state, tokenPanelOpen: action.open };
    case 'collectionsInvalidated':
      return { ...state, collectionsLoaded: false };
    case 'collectionsStarted':
      return { ...state, collectionsLoading: true, errorMessage: undefined };
    case 'collectionsSucceeded':
      return {
        ...state,
        collections: action.collections,
        collectionsLoaded: true,
        collectionsLoading: false,
      };
    case 'collectionsFailed':
      return { ...state, collectionsLoading: false, errorMessage: action.message };
    case 'importStarted':
      return { ...state, importingId: action.importingId };
    case 'importSucceeded':
      return { ...state, ldacaImportOpen: false, filter: '', tokenPanelOpen: false };
    case 'importFinished':
      return { ...state, importingId: undefined };
  }
}

/** Case-insensitive match on title, description, and identifier. */
export function filterLdacaCollections(
  collections: LdacaCollection[],
  filter: string,
): LdacaCollection[] {
  const needle = filter.trim().toLocaleLowerCase();
  if (!needle) return collections;
  return collections.filter((collection) =>
    [collection.title, collection.description ?? '', collection.crate_id ?? collection.id].some(
      (value) => value.toLocaleLowerCase().includes(needle),
    ),
  );
}
