import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { applicationCacheDirectory, applicationConfigurationDirectory, applicationEnvironment, DEV_IDENTITY, TEST_IDENTITY } from '../../scripts/app-environment.mjs';
import { prepareTestCache } from './test-cache.mjs';

test('system paths separate Dev and Test and reject production cleanup', () => {
  for (const identity of [DEV_IDENTITY, TEST_IDENTITY]) {
    assert.equal(applicationCacheDirectory(identity, { HOME: '/home/u' }, 'darwin'), resolve('/home/u/Library/Caches', identity));
    assert.equal(applicationCacheDirectory(identity, { LOCALAPPDATA: '/local' }, 'win32'), resolve('/local', identity));
    assert.equal(applicationCacheDirectory(identity, { XDG_CACHE_HOME: '/cache' }, 'linux'), resolve('/cache', identity));
    assert.equal(applicationConfigurationDirectory(identity, { HOME: '/home/u' }, 'darwin'), resolve('/home/u/Library/Application Support', identity));
    assert.equal(applicationConfigurationDirectory(identity, { APPDATA: '/roaming' }, 'win32'), resolve('/roaming', identity));
    assert.equal(applicationConfigurationDirectory(identity, { XDG_CONFIG_HOME: '/config' }, 'linux'), resolve('/config', identity));
  }
  assert.throws(() => applicationCacheDirectory('au.edu.ldaca.wordflow'), /Only Dev and Test/);
  assert.throws(() => applicationConfigurationDirectory('au.edu.ldaca.wordflow'), /Only Dev and Test/);
  assert.throws(() => applicationCacheDirectory(TEST_IDENTITY, { XDG_CACHE_HOME: 'relative' }, 'linux'), /absolute/);
  const env = applicationEnvironment(TEST_IDENTITY, { HOME: '/home/u', HF_HOME: '/production/hf', WORDFLOW_QUOTATION_MODEL: '/production/model' }, 'darwin');
  assert.ok(env.HF_HOME.includes(TEST_IDENTITY));
  assert.equal(env.WORDFLOW_QUOTATION_MODEL, undefined);
  assert.equal(env.WORDFLOW_ICU_PATH, undefined);
});

test('each test run starts empty, serializes cache ownership and leaves production and Dev untouched', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'wordflow-cache-contract-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = { HOME: home };
  const caches = join(home, 'Library/Caches');
  const settings = join(home, 'Library/Application Support');
  for (const base of [caches, settings]) {
    for (const identity of ['au.edu.ldaca.wordflow', DEV_IDENTITY, TEST_IDENTITY]) {
      await mkdir(join(base, identity), { recursive: true });
      await writeFile(join(base, identity, 'canary'), identity);
    }
  }
  const first = await prepareTestCache(env, 'darwin');
  assert.deepEqual(await readdir(first.directory), []);
  await assert.rejects(readFile(join(first.configuration, 'canary')), { code: 'ENOENT' });
  await writeFile(join(first.directory, 'active'), 'current run');
  await assert.rejects(prepareTestCache(env, 'darwin'), /Another E2E run owns/);
  assert.equal(await readFile(join(first.directory, 'active'), 'utf8'), 'current run');
  await first.cleanup();
  const second = await prepareTestCache(env, 'darwin');
  await writeFile(join(second.directory, 'active'), 'next run');
  await first.cleanup(); // Repeated teardown must not remove the next run's cache.
  assert.equal(await readFile(join(second.directory, 'active'), 'utf8'), 'next run');
  await second.cleanup();
  await assert.rejects(readFile(join(second.directory, 'active')), { code: 'ENOENT' });
  for (const base of [caches, settings]) {
    for (const identity of ['au.edu.ldaca.wordflow', DEV_IDENTITY]) {
      assert.equal(await readFile(join(base, identity, 'canary'), 'utf8'), identity);
    }
  }
});
