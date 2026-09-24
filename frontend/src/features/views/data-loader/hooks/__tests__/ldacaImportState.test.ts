import { describe, expect, it } from 'vitest';
import type { DataPortalRecord } from '@/api';
import {
  filterLdacaCollections,
  initialLdacaImportState,
  ldacaImportReducer,
} from '../ldacaImportState';

const collection = (title: string, description: string | null = null): DataPortalRecord => ({
  id: `arcp://${title}`,
  crate_id: `arcp://${title}`,
  title,
  description,
  importable: true,
});

describe('ldacaImportReducer', () => {
  it('invalidates loaded collections so a token change re-checks access', () => {
    const loaded = ldacaImportReducer(initialLdacaImportState, {
      type: 'collectionsSucceeded',
      collections: [collection('COOEE')],
    });
    expect(loaded).toMatchObject({ collectionsLoaded: true, collectionsLoading: false });

    expect(ldacaImportReducer(loaded, { type: 'collectionsInvalidated' }).collectionsLoaded).toBe(
      false,
    );
  });

  it('closes and resets the filter and token panel after an import starts', () => {
    const state = {
      ...initialLdacaImportState,
      ldacaImportOpen: true,
      filter: 'speech',
      tokenPanelOpen: true,
    };

    expect(ldacaImportReducer(state, { type: 'importSucceeded' })).toMatchObject({
      ldacaImportOpen: false,
      filter: '',
      tokenPanelOpen: false,
    });
  });
});

describe('filterLdacaCollections', () => {
  const collections = [
    collection('A COrpus of Oz Early English (COOEE)', 'Colonial letters'),
    collection('Sydney Speaks', 'Sociolinguistic interviews'),
  ];

  it('matches title, description, and identifier case-insensitively', () => {
    expect(filterLdacaCollections(collections, 'cooee').map((item) => item.title)).toEqual([
      'A COrpus of Oz Early English (COOEE)',
    ]);
    expect(filterLdacaCollections(collections, 'INTERVIEWS')).toHaveLength(1);
    expect(filterLdacaCollections(collections, 'arcp://sydney')).toHaveLength(1);
    expect(filterLdacaCollections(collections, '  ')).toHaveLength(2);
  });
});
