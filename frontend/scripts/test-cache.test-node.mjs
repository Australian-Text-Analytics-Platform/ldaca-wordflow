import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applicationDirectories, applicationEnvironment, DEV_IDENTITY, TEST_IDENTITY } from '../../scripts/app-environment.mjs';
import { prepareTestCache } from './test-cache.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'wordflow-storage-contract-'));
  const env = { HOME: home, USERPROFILE: home, APPDATA: join(home, 'roaming'), LOCALAPPDATA: join(home, 'local'), XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data'), XDG_CACHE_HOME: join(home, 'cache'), TMPDIR: join(home, 'tmp'), TEMP: join(home, 'tmp'), TMP: join(home, 'tmp') };
  await mkdir(env.TMPDIR);
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, env };
}
test('Rust-resolved categories separate Dev and Test and reject production cleanup', async t => {
  const { env } = await fixture(t);
  const dev = applicationDirectories(DEV_IDENTITY, env);
  const testPaths = applicationDirectories(TEST_IDENTITY, env);
  for (const category of Object.keys(dev)) {
    assert.notEqual(dev[category], testPaths[category]);
    assert.ok(testPaths[category].includes(TEST_IDENTITY));
  }
  assert.throws(() => applicationDirectories('au.edu.ldaca.wordflow', env), /Only Dev and Test/);
  const isolated = applicationEnvironment(TEST_IDENTITY, { ...env, HF_HOME: '/production/hf', WORDFLOW_QUOTATION_MODEL: '/production/model' });
  assert.equal(isolated.HF_HOME, undefined);
  assert.equal(isolated.WORDFLOW_QUOTATION_MODEL, undefined);
  assert.equal(isolated.WORDFLOW_ICU_PATH, undefined);
  assert.deepEqual(JSON.parse(isolated.WORDFLOW_STORAGE_PATHS), testPaths);
});
test('every category starts empty, cleanup is locked, and Dev and production canaries survive', async t => {
  const { env } = await fixture(t);
  const dev = [...new Set(Object.values(applicationDirectories(DEV_IDENTITY, env)))];
  const roots = [...new Set(Object.values(applicationDirectories(TEST_IDENTITY, env)))];
  const production = dev.map(path => path.replace(DEV_IDENTITY, 'au.edu.ldaca.wordflow'));
  for (const path of [...dev, ...production, ...roots]) { await mkdir(path, { recursive: true }); await writeFile(join(path, 'canary'), path); }
  const first = await prepareTestCache(env, async () => undefined);
  for (const path of roots) await assert.rejects(readFile(join(path, 'canary')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(first.directory), []);
  await writeFile(join(first.directory, 'active'), 'current run');
  await assert.rejects(prepareTestCache(env, async () => undefined), /Another E2E run owns/);
  await first.cleanup();
  const second = await prepareTestCache(env, async () => undefined);
  await writeFile(join(second.directory, 'active'), 'next run');
  await first.cleanup();
  assert.equal(await readFile(join(second.directory, 'active'), 'utf8'), 'next run');
  await second.cleanup();
  for (const path of [...dev, ...production]) assert.equal(await readFile(join(path, 'canary'), 'utf8'), path);
});
