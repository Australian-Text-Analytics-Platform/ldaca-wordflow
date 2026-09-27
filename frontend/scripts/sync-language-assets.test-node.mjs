import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyLanguageAssets } from './sync-language-assets.mjs';
test('release inputs exclude optional language binaries', async () => { await verifyLanguageAssets(); });
test('guard catches accidentally restored bundled models', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wordflow-assets-'));
  try {
    await mkdir(path.join(directory, 'models'));
    await writeFile(path.join(directory, 'models/language-detector.tflite'), 'model');
    await assert.rejects(verifyLanguageAssets(directory), /must not be bundled/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('production scripts trust only self and the native loopback host, not download origins', async () => {
  const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const script = config.app.security.csp.split(';').find(value => value.trim().startsWith('script-src'));
  assert.equal(script.trim(), "script-src 'self' 'wasm-unsafe-eval' http://127.0.0.1:*");
  assert.doesNotMatch(config.app.security.csp, /cdn\.jsdelivr|storage\.googleapis/);
});
