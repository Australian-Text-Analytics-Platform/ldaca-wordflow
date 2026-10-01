import { isAbsolute, join, resolve } from 'node:path';

export const DEV_IDENTITY = 'au.edu.ldaca.wordflow.dev';
export const TEST_IDENTITY = 'au.edu.ldaca.wordflow.test';

export function applicationConfigurationDirectory(identity, env = process.env, platform = process.platform) {
  if (![DEV_IDENTITY, TEST_IDENTITY].includes(identity)) {
    throw new Error('Only Dev and Test configuration directories may be managed by development tooling');
  }
  const base = platform === 'darwin'
    ? env.HOME && join(env.HOME, 'Library/Application Support')
    : platform === 'win32'
      ? env.APPDATA
      : env.XDG_CONFIG_HOME || (env.HOME && join(env.HOME, '.config'));
  if (!base || !isAbsolute(base)) throw new Error('Cannot locate an absolute system configuration directory');
  return resolve(base, identity);
}

export function applicationCacheDirectory(identity, env = process.env, platform = process.platform) {
  if (![DEV_IDENTITY, TEST_IDENTITY].includes(identity)) {
    throw new Error('Only Dev and Test cache directories may be managed by development tooling');
  }
  const base = platform === 'darwin'
    ? env.HOME && join(env.HOME, 'Library/Caches')
    : platform === 'win32'
      ? env.LOCALAPPDATA
      : env.XDG_CACHE_HOME || (env.HOME && join(env.HOME, '.cache'));
  if (!base || !isAbsolute(base)) throw new Error('Cannot locate an absolute system cache directory');
  return resolve(base, identity);
}

export function applicationEnvironment(identity, env = process.env, platform = process.platform) {
  const cache = applicationCacheDirectory(identity, env, platform);
  return {
    WORDFLOW_APP_ID: identity,
    WORDFLOW_CACHE_DIR: cache,
    HF_HOME: join(cache, 'huggingface'),
    LINDERA_DICT_PATH: join(cache, 'lindera'),
    WORDFLOW_QUOTATION_CACHE: join(cache, 'udpipe'),
    WORDFLOW_EMBEDDING_CACHE: join(cache, 'embeddings.duckdb'),
    // Do not inherit overrides pointing at production's cached assets.
    WORDFLOW_QUOTATION_MODEL: undefined,
    WORDFLOW_ICU_PATH: undefined,
  };
}
