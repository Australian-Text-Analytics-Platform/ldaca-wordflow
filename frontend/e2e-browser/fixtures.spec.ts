import { expect } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl, get, post, resetProject } from './fixtures';
import { createTab } from '@/features/tools/common/analysisApi';
import { publishConcordance, runConcordance } from '@/features/tools/concordance/api';

it('resets unregistered objects and named types in every test-created schema', async () => {
  const response = await post('/api/project/sql', {
    script: `CREATE SCHEMA "left over";
      CREATE TYPE "left over".mood AS ENUM ('calm');
      CREATE TABLE "left over".source AS SELECT 'calm'::"left over".mood AS value;
      CREATE VIEW "left over".dependent AS SELECT * FROM "left over".source;`,
    response: 'command',
  });
  expect(response.ok).toBe(true);
  await resetProject();
  const graph = await get('/api/project/graph?mode=dependencies');
  expect(await graph.json()).toMatchObject({ nodes: [], edges: [] });
  // Reusing the schema and type names must also work after a failed scenario.
  const reused = await post('/api/project/sql', {
    script: `CREATE SCHEMA "left over"; CREATE TYPE "left over".mood AS ENUM ('busy');`,
    response: 'command',
  });
  expect(reused.ok).toBe(true);
});

it('resets independently owned publications before clearing their source schemas', async () => {
  const imported = await post('/api/project/import', {
    sources: [{ table_name: 'published_source', sql: "SELECT 'cat' AS text" }],
  });
  expect(imported.ok).toBe(true);
  const tab = await createTab(baseUrl, 'concordance');
  const result = await runConcordance(baseUrl, tab.id, {
    inputs: [{ source: { schema: 'data', name: 'published_source' }, column: 'text', tokenizer: null }],
    search: {
      mode: 'text', query: 'cat', whole_word: true, regex: false, case_sensitive: false,
      ignore_punctuation: true, left_context: 10, right_context: 10,
    },
  });
  await publishConcordance(baseUrl, result.id, 'documents', [{
    source_index: 0, name: 'published_result', metadata: [], fields: [],
  }]);
  await resetProject();
  const exported = await post('/api/project/exports', { kind: 'complete_project' });
  if (!exported.ok) throw new Error(await exported.text());
  expect((await exported.arrayBuffer()).byteLength).toBeGreaterThan(0);
});
