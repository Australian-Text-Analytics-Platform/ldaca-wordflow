import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startWdioSession, cleanupWdioSession, createTauriCapabilities } from '@wdio/tauri-service';
import { nativeTestBuild, validateNativeTestBuild } from './native-e2e.mjs';
import { prepareTestCache } from './test-cache.mjs';

import { assertGuiTestEnvironment } from './gui-test-environment.mjs';

assertGuiTestEnvironment();
const plan = nativeTestBuild('debug');
const manifest = JSON.parse(await readFile(join(plan.output, 'build.json'), 'utf8'));
validateNativeTestBuild(manifest, plan, createHash('sha256').update(await readFile(plan.binary)).digest('hex'));
const storage = await prepareTestCache();
for (const [key, value] of Object.entries(storage.env)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
let profile;
const identifiers = [];
let browser;
try {
  await mkdir(storage.directories.temporary, { recursive: true });
  profile = await mkdtemp(join(storage.directories.temporary, 'restart-webview-'));
  process.env.WORDFLOW_E2E_PROFILE_DIR = profile;
  for (const phase of ['save', 'restart']) {
    const identifier = randomUUID();
    identifiers.push(identifier);
    process.env.WORDFLOW_E2E_STORE_ID = identifier;
    const capabilities = createTauriCapabilities(plan.binary, { driverProvider: 'embedded', logLevel: 'warn' });
    capabilities['wdio:tauriServiceOptions'].windowLabel = 'project-0';
    browser = await startWdioSession(capabilities);
    await browser.switchToWindow('project-0');
    await browser.$('h1=Data Loader').waitForDisplayed({ timeout: 30000 });
    const status = await browser.tauri.execute(({ core }) => core.invoke('get_backend_status'));
    if (phase === 'save') {
      const saved = await browser.tauri.execute(({ core }) => core.invoke('patch_preferences', { patch: { theme: 'dark-2026', layout: { sidebarWidth: 299 }, hiddenTools: ['plots'], guidance: { enabled: false, acknowledge: { id: 'export.setup', version: 1 } } } }));
      assert.equal(saved.layout.sidebarWidth, 299);
      const token = await fetch(`${status.url}/api/portal/credential`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'session', key: 'synthetic-wordflow-restart-token' }) });
      assert.equal(token.ok, true);
      assert.equal((await token.json()).has_credential, true);
    } else {
      const loaded = await browser.tauri.execute(({ core }) => core.invoke('get_preferences'));
      assert.equal(loaded.theme, 'dark-2026');
      assert.equal(loaded.layout.sidebarWidth, 299);
      assert.deepEqual(loaded.hiddenTools, ['plots']);
      assert.deepEqual(loaded.guidance, { enabled: false, acknowledgments: { 'export.setup': 1 } });
      assert.equal(await browser.$('html').getAttribute('data-theme'), 'dark-2026');
      const credential = await fetch(`${status.url}/api/portal/credential`);
      assert.equal(credential.ok, true);
      assert.equal((await credential.json()).has_credential, false);
    }
    await cleanupWdioSession(browser);
    browser = undefined;
    const disk = JSON.parse(await readFile(join(storage.directories.config, 'preferences.json'), 'utf8'));
    assert.equal(disk.theme, 'dark-2026');
    assert.equal(disk.layout.sidebarWidth, 299);
    assert.equal(disk.schemaVersion, 2);
    assert.deepEqual(disk.hiddenTools, ['plots']);
    assert.deepEqual(disk.guidance, { enabled: false, acknowledgments: { 'export.setup': 1 } });
    assert.equal(JSON.stringify(disk).includes('synthetic-wordflow-restart-token'), false);
    console.log('Completed native process phase:', phase, 'fresh store:', identifier);
  }
  console.log('PASS: native preferences survive process restart; session Portal credentials do not');
} finally {
  try {
    if (browser) await cleanupWdioSession(browser);
    if (process.platform === 'darwin') for (const identifier of identifiers) {
      const result = spawnSync(plan.binary, [], { env: { ...process.env, WORDFLOW_E2E_STORE_ID: identifier, WORDFLOW_E2E_CLEANUP_STORE: '1' }, stdio: 'inherit', timeout: 15000 });
      assert.equal(result.status, 0, 'Remove the test-owned WebKit store');
    }
    if (profile) await rm(profile, { recursive: true, force: true });
  } finally { await storage.cleanup(); }
}
