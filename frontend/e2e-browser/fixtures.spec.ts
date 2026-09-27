import { expect } from '@wdio/globals';
import { it } from 'mocha';
import { get, post, resetProject } from './fixtures';

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
