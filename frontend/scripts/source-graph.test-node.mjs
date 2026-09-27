import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { entries, root, sourceGraph } from './source-graph.mjs';

test('all production hosts reach their own entry without retired controllers or test-only imports', () => {
  assert.deepEqual(entries, ['src/index.tsx', 'src/updater/index.tsx', 'src/features/quicklook/render.ts']);
  const files = [...sourceGraph()].map(file => path.relative(root, file).split(path.sep).join('/'));
  for (const required of ['src/features/project/ProjectView.tsx', 'src/features/tools/preprocessing/sql/SqlSubTab.tsx', 'src/features/quicklook/render.ts', 'src/features/updater/UpdaterWindow.tsx']) {
    assert.ok(files.includes(required), `${required} is a production dependency`);
  }
  assert.equal(files.some(file => /(?:^|\/)(?:archive|test|__tests__|auth)(?:\/|$)|\.(?:test|spec)\./.test(file)), false);
  assert.ok(files.includes('src/features/server/ServerApp.tsx'));
  assert.deepEqual(files.filter(file => file.startsWith('src/api/generated/')), ['src/api/generated/native.ts']);
});
