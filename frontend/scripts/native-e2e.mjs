#!/usr/bin/env node
// Keep instrumented release artifacts separate from distributable builds.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertGuiTestEnvironment } from './gui-test-environment.mjs';

const root = resolve(import.meta.dirname, '..');
export function nativeTestBuild(profile, platform = process.platform) {
  if (!['debug', 'release'].includes(profile)) throw new Error(`Unknown native test profile: ${profile}`);
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Native WebDriver is not configured for ${platform}`);
  const target = resolve(root, '../target', profile === 'release' ? 'e2e-release' : '.');
  const binary = resolve(target, profile, platform === 'darwin' && profile === 'release'
    ? 'bundle/macos/LDaCA Wordflow.app/Contents/MacOS/ldaca-wordflow'
    : `ldaca-wordflow${platform === 'win32' ? '.exe' : ''}`);
  return {
    target, binary,
    output: resolve(root, '.tmp/wdio', `native-${profile}`),
    args: ['exec', 'tauri', 'build',
      ...(profile === 'debug' ? ['--debug'] : []),
      ...(platform === 'darwin' && profile === 'release' ? ['--bundles', 'app'] : ['--no-bundle']),
      '--features', 'e2e', '--config', 'src-tauri/tauri.e2e.conf.json',
      '--config', 'src-tauri/tauri.local-build.conf.json', '--', '--locked'],
  };
}

function main() {
  const [action, profile, ...extra] = process.argv.slice(2);
  if (!['build', 'test'].includes(action)) throw new Error('Expected build or test, followed by debug or release');
  if (action === 'build' && extra.length) throw new Error('Build overrides are not supported; use the named test profiles');
  if (action === 'test') assertGuiTestEnvironment();
  if (!process.env.npm_execpath) throw new Error('Run through pnpm build:e2e:native or test:e2e:native (optionally :release)');
  const plan = nativeTestBuild(profile);
  const manifestPath = resolve(plan.output, 'build.json');
  const hash = () => createHash('sha256').update(readFileSync(plan.binary)).digest('hex');
  mkdirSync(plan.output, { recursive: true });
  const env = { ...process.env, CARGO_TARGET_DIR: plan.target,
    WORDFLOW_E2E_OUTPUT_DIR: plan.output, WORDFLOW_E2E_BINARY: plan.binary };
  if (action === 'test') {
    const build = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (build.sha256 !== hash() || build.profile !== profile) {
      throw new Error('Native test binary changed since its build record. Rebuild with build:e2e:native first.');
    }
    console.log('Testing native application:', JSON.stringify(build, null, 2));
  }
  const profileDirectory = action === 'test' ? mkdtempSync(resolve(tmpdir(), 'wordflow-e2e-')) : undefined;
  if (profileDirectory) {
    env.WORDFLOW_E2E_PROFILE_DIR = profileDirectory;
    env.WORDFLOW_E2E_STORE_ID = randomUUID();
    console.log('Test-owned browser store:', env.WORDFLOW_E2E_STORE_ID);
  }
  const args = action === 'build' ? plan.args : ['exec', 'wdio', 'run', 'wdio.conf.ts', ...extra];
  const child = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, env, stdio: 'inherit' });
  if (profileDirectory) {
    const cleanup = process.platform === 'darwin'
      ? spawnSync(plan.binary, [], { env: { ...env, WORDFLOW_E2E_CLEANUP_STORE: '1' }, stdio: 'inherit', timeout: 15000 })
      : { status: 0 };
    rmSync(profileDirectory, { recursive: true, force: true });
    if (cleanup.error) throw cleanup.error;
    if (cleanup.status !== 0) throw new Error('Native test store cleanup failed');
    console.log('Removed test-owned browser profile:', env.WORDFLOW_E2E_STORE_ID);
  }
  if (child.error) throw child.error;
  if (child.status !== 0) { process.exitCode = child.status ?? 1; return; }
  if (action === 'build') {
    // Windows' unbundled runner resolves resources beside its executable.
    // Installer acceptance remains a separate, uninstrumented packaging check.
    if (process.platform === 'win32') cpSync(resolve(root, 'src-tauri/resources'),
      resolve(plan.target, profile, 'resources'), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({
      identity: JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')).identifier,
      profile, instrumented: true, binary: plan.binary, sha256: hash(), builtAt: new Date().toISOString(),
    }, null, 2));
  }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
