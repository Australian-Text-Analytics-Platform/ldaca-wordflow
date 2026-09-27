import { expect, it } from 'vitest';
import { renamedDrafts, renameReferences } from './renameReferences';
it('changes only known references and keeps newer drafts and literal text', () => {
  const request = {
    inputs: [{ source: { name: 'Corpus' }, column: 'text', future: 'text' }],
    search: { query: 'text' },
    future: { column: 'text' },
  };
  const result = renameReferences(request, {
    type: 'column',
    source: { schema: 'data', name: 'corpus' },
    before: 'text',
    after: 'content',
  });
  expect(result.inputs[0]?.column).toBe('content');
  expect(result.search.query).toBe('text');
  expect(result.future.column).toBe('text');
  expect(request.inputs[0]?.column).toBe('text');
});
it('reconciles plot mode scopes without touching another project', () => {
  const key = JSON.stringify([JSON.stringify(['host', 'trends']), 'tab']);
  const other = JSON.stringify(['other', 'tab']);
  const draft = {
    source: { schema: 'data', name: 'source' },
    axis: 'time',
    groups: ['group'],
    timezone: 'UTC',
  };
  const result = renamedDrafts({ [key]: draft, [other]: draft }, 'host', {
    type: 'column',
    source: draft.source,
    before: 'group',
    after: 'category',
  });
  expect(result[key]?.groups).toEqual(['category']);
  expect(result[other]).toBe(draft);
  expect(result[key]?.timezone).toBe('UTC');
});
