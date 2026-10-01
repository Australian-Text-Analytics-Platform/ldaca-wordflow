import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applicationCacheDirectory, applicationConfigurationDirectory, applicationEnvironment, TEST_IDENTITY } from '../../scripts/app-environment.mjs';

/** Serialize cache-owning E2E suites before clearing only Test's system cache. */
export async function prepareTestCache(env = process.env, platform = process.platform) {
  const directory = applicationCacheDirectory(TEST_IDENTITY, env, platform);
  const configuration = applicationConfigurationDirectory(TEST_IDENTITY, env, platform);
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
      await rm(directory, { recursive: true, force: true });
      await rm(configuration, { recursive: true, force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  };
  try {
    await rm(directory, { recursive: true, force: true });
    await rm(configuration, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    return { directory, configuration, env: applicationEnvironment(TEST_IDENTITY, env, platform), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
