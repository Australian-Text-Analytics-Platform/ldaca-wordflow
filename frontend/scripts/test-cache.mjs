import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applicationDirectories, applicationEnvironment, TEST_IDENTITY } from '../../scripts/app-environment.mjs';

async function clearTestCredentials(env) {
  const root = resolve(import.meta.dirname, '../..');
  execFileSync('cargo', ['run', '--quiet', '--locked', '-p', 'wordflow-backend', '--bin', 'wordflow-test-reset'], { cwd: root, env: { ...process.env, ...env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || (existsSync(resolve(root, 'target')) ? realpathSync(resolve(root, 'target')) : resolve(root, 'target')) }, stdio: ['ignore', 'ignore', 'inherit'] });
}
/** Serialize E2E suites before clearing all resolved Test-owned roots and credentials. */
export async function prepareTestCache(env = process.env, resetCredentials = clearTestCredentials) {
  const directories = applicationDirectories(TEST_IDENTITY, env);
  const directory = directories.cache;
  const configuration = directories.config;
  const roots = [...new Set(Object.values(directories))].sort((a, b) => b.length - a.length);
  const lock = `${directory}.lock`;
  await mkdir(dirname(directory), { recursive: true });
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another E2E run owns ${lock}. Do not run cache-owning suites concurrently.`, { cause: error });
    throw error;
  }
  let released = false;
  const cleanup = async () => {
    if (released) return;
    released = true;
    try {
      await resetCredentials(env);
      for (const path of roots) await rm(path, { recursive: true, force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  };
  try {
    await resetCredentials(env);
    for (const path of roots) await rm(path, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    return { directory, configuration, directories, env: applicationEnvironment(TEST_IDENTITY, env), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
