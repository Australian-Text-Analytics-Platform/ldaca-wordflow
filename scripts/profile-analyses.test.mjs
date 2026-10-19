import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { options, privateOutput, resources, report, runChild } from './profile-analyses.mjs';

test('campaign arguments distinguish all rows, profile repetitions and explicit table columns', () => {
  const value = options(['--input', '/private/data.zip', '--output', '/private/results', '--sizes', '100,all', '--table', 'articles', '--column', 'body']);
  assert.deepEqual(value.sizes, [100, null]);
  assert.equal(value.repeats, 3);
  assert.equal(value.column, 'body');
  assert.equal(options(['--input', 'x', '--output', 'y', '--profile', 'cpu']).repeats, 1);
  for (const extra of [['--sizes', '0'], ['--sizes', '100,100'], ['--repeats', '-1'], ['--seed', 'NaN'], ['--analysis', 'other']]) {
    assert.throws(() => options(['--input', 'x', '--output', 'y', ...extra]));
  }
  assert.throws(() => options([]));
});

test('private output rejects checkout descendants and symlink aliases before writing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-profile-path-'));
  try {
    const checkout = join(directory, 'repo');
    await mkdir(checkout);
    await symlink(checkout, join(directory, 'alias'));
    await assert.rejects(privateOutput(join(checkout, 'new', 'results'), checkout), /outside/);
    await assert.rejects(privateOutput(join(directory, 'alias', 'new'), checkout), /outside/);
    assert.equal(await privateOutput(join(directory, 'external'), checkout), join(await privateOutput(directory, checkout), 'external'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('resource parser requires complete CPU and RSS evidence', () => {
  assert.equal(resources('1.23 real 4.50 user 0.20 sys\n1073741824 maximum resident set size').peak_rss_bytes, 2 ** 30);
  assert.throws(() => resources('time: sysctl: Operation not permitted'), /complete/);
});

test('failed and profiled cases never enter baseline statistics', () => {
  const result = { analysis_seconds: 2, stages: [{ stage: 'Embedding', seconds: 1 }] };
  const text = report({ input_sha256: 'test', cases: [
    { id: 'good', analysis: 'topic', size: 100, cache: 'empty', status: 'succeeded', result },
    { id: 'failed', analysis: 'topic', size: 100, cache: 'empty', status: 'failed', result: { analysis_seconds: 999 } },
    { id: 'profile', analysis: 'topic', size: 100, cache: 'empty', status: 'succeeded', profile: 'cpu', result: { analysis_seconds: 999 } },
  ] });
  assert.match(text, /single observation/);
  assert.doesNotMatch(text, /999/);
  assert.match(text, /failed: failed/);
});

test('child failures retain diagnostics and a nonzero outcome', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-profile-child-'));
  try {
    const outcome = await runChild(process.execPath, ['-e', 'console.error("controlled failure"); process.exit(7)'], { directory });
    assert.equal(outcome.code, 7);
    assert.match(await readFile(join(directory, 'worker.stderr.log'), 'utf8'), /controlled failure/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an already interrupted campaign does not leave a worker running', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-profile-interrupt-'));
  const controller = new AbortController();
  controller.abort();
  try {
    const outcome = await runChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { directory, signal: controller.signal });
    assert.notEqual(outcome.code, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
