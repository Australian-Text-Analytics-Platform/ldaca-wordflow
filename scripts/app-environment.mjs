import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const DEV_IDENTITY = 'au.edu.ldaca.wordflow.dev';
export const TEST_IDENTITY = 'au.edu.ldaca.wordflow.test';
const root = resolve(import.meta.dirname, '..');
const resolved = new Map();

/** The Rust resolver owns platform paths. This command only reads paths. */
export function applicationDirectories(identity, env = process.env) {
  if (![DEV_IDENTITY, TEST_IDENTITY].includes(identity)) {
    throw new Error('Only Dev and Test directories may be managed by development tooling');
  }
  const environment = { ...process.env, CARGO_HOME: process.env.CARGO_HOME || join(homedir(), '.cargo'), RUSTUP_HOME: process.env.RUSTUP_HOME || join(homedir(), '.rustup'), ...env };
  const key = JSON.stringify([identity, ...['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'TMPDIR', 'TEMP', 'TMP'].map((name) => environment[name])]);
  if (!resolved.has(key)) {
    const paths = JSON.parse(execFileSync('cargo', ['run', '--quiet', '--locked', '-p', 'wordflow-storage', '--bin', 'wordflow-storage', '--', '--identity', identity], {
      cwd: root, env: { ...environment, CARGO_TARGET_DIR: environment.CARGO_TARGET_DIR || (existsSync(join(root, 'target')) ? realpathSync(join(root, 'target')) : join(root, 'target')) }, encoding: 'utf8',
    }));
    if (Object.values(paths).some((path) => typeof path !== 'string' || !isAbsolute(path))) throw new Error('Rust returned invalid application directories');
    resolved.set(key, paths);
  }
  return resolved.get(key);
}
export function applicationCacheDirectory(identity, env = process.env) {
  return applicationDirectories(identity, env).cache;
}
export function applicationEnvironment(identity, env = process.env) {
  const directories = applicationDirectories(identity, env);
  return {
    WORDFLOW_APP_ID: identity,
    WORDFLOW_STORAGE_PATHS: JSON.stringify(directories),
    HF_HOME: undefined,
    LINDERA_DICT_PATH: undefined,
    WORDFLOW_CACHE_DIR: undefined,
    WORDFLOW_QUOTATION_CACHE: undefined,
    WORDFLOW_QUOTATION_MODEL: undefined,
    WORDFLOW_EMBEDDING_CACHE: undefined,
    WORDFLOW_ICU_PATH: undefined,
  };
}
