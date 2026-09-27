import { describe, expect, it } from 'vitest';

import { createProjectSqlDataBlock, getSession, queryProjectSqlTable } from '@/api';
import { API_MOCK_ORIGIN } from '@/test/msw/handlers';

describe('generated client with MSW', () => {
  it('reads the cookie-session bootstrap response through the generated client', async () => {
    const { data } = await getSession({ baseUrl: API_MOCK_ORIGIN, throwOnError: true });
    expect(data).toMatchObject({ mode: 'single_user', authenticated: false });
  });

  it('decodes generated-client binary table responses through the Arrow adapter', async () => {
    const page = await queryProjectSqlTable({
      baseUrl: API_MOCK_ORIGIN,
      path: { workspace_id: 'project-1' },
      body: {
        mode: 'query',
        node_ids: ['node-1'],
        sql: 'SELECT * FROM "node-1"',
        page: 1,
        page_size: 20,
      },
    });

    expect(page.rows).toEqual([
      { text: 'This is an English sample document for language detection.' },
    ]);
    expect(page.hasNext).toBe(false);
    expect(page.etag).toBe('"project-1"');
  });

  it('returns the JSON Data Block resource for SQL creation mode', async () => {
    const node = await createProjectSqlDataBlock({
      baseUrl: API_MOCK_ORIGIN,
      path: { workspace_id: 'project-1' },
      body: {
        mode: 'create',
        node_ids: ['node-1'],
        sql: 'SELECT * FROM "node-1"',
        name: 'SQL result',
      },
    });

    expect(node).toMatchObject({
      id: 'node-1',
      name: 'Text',
      shape: [1, 1],
      provenance: { type: 'source', file_path: 'text.csv' },
    });
  });
});
