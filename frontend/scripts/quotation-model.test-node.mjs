import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareQuotationModel, quotationModel, quotationModelPath, requireQuotationModel } from './quotation-model.mjs';

const bytes = Buffer.from('controlled model fixture');
const model = { filename: 'fixture.udpipe', url: 'https://example.invalid/model', sha256: createHash('sha256').update(bytes).digest('hex') };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'quotation-model-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, model.filename) };
}

test('reads the model pin from the native extractor', async () => {
  const pin = await quotationModel();
  assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  assert.ok(pin.url.endsWith(pin.filename));
});

test('resolves the native cache convention on each platform, with optional override', () => {
  assert.equal(quotationModelPath('m', { HOME: '/home/test' }, 'darwin'), join('/home/test/Library/Caches/au.edu.ldaca.wordflow/udpipe/m'));
  assert.equal(quotationModelPath('m', { LOCALAPPDATA: '/local' }, 'win32'), join('/local/au.edu.ldaca.wordflow/udpipe/m'));
  assert.equal(quotationModelPath('m', { XDG_CACHE_HOME: '/cache', HOME: '/home/test' }, 'linux'), join('/cache/au.edu.ldaca.wordflow/udpipe/m'));
  assert.equal(quotationModelPath('m', { HOME: '/home/test' }, 'linux'), join('/home/test/.cache/au.edu.ldaca.wordflow/udpipe/m'));
  assert.equal(quotationModelPath('m', { WORDFLOW_QUOTATION_MODEL: '/explicit/model' }, 'darwin'), '/explicit/model');
  assert.throws(() => quotationModelPath('m', {}, 'win32'), /Set WORDFLOW_QUOTATION_MODEL/);
});

test('cached model validation and preparation work offline', async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, bytes);
  assert.equal(await requireQuotationModel(model, path), path);
  assert.equal(await prepareQuotationModel(model, path, () => { throw new Error('No network allowed'); }), path);
});

test('missing and corrupt models fail with setup instructions, without downloading', async (t) => {
  const { path } = await fixture(t);
  await assert.rejects(requireQuotationModel(model, path), /pnpm prepare:e2e:models/);
  await writeFile(path, 'corrupt');
  await assert.rejects(requireQuotationModel(model, path), /checksum is invalid/);
  assert.equal(await readFile(path, 'utf8'), 'corrupt');
});

test('explicit preparation installs verified bytes and leaves no staging files', async (t) => {
  const { path, directory } = await fixture(t);
  await prepareQuotationModel(model, path, async (url) => {
    assert.equal(url, model.url);
    return new Response(bytes);
  });
  assert.equal(await requireQuotationModel(model, path), path);
  assert.deepEqual(await readdir(directory), [model.filename]);
});

test('bad downloads preserve the existing file and can be retried', async (t) => {
  const { path, directory } = await fixture(t);
  await writeFile(path, 'old');
  await assert.rejects(prepareQuotationModel(model, path, async () => new Response('bad')), /checksum/);
  await assert.rejects(prepareQuotationModel(model, path, async () => new Response('', { status: 503 })), /HTTP 503/);
  assert.equal(await readFile(path, 'utf8'), 'old');
  assert.deepEqual(await readdir(directory), [model.filename]);
  await prepareQuotationModel(model, path, async () => new Response(bytes));
  assert.equal(await requireQuotationModel(model, path), path);
});
