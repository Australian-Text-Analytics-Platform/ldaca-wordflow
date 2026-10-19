import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { allocationWorker, checksum, options, privateOutput, resources, report, runChild } from './profile-analyses.mjs';

test('Allocations gets a debuggable private copy without changing executable code identity', { skip: process.platform !== 'darwin' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-profile-signing-'));
  let prepared;
  try {
    const source = join(directory, 'probe.c');
    const executable = join(directory, 'probe');
    await writeFile(source, '#include <stdio.h>\nint main(void) { puts("profile probe"); return 0; }\n');
    execFileSync('clang', ['-g', source, '-o', executable]);
    const original = await checksum(executable);
    prepared = await allocationWorker(executable, directory);
    assert.notEqual(prepared.path, executable);
    assert.equal(await checksum(executable), original);
    assert.equal(await checksum(prepared.path), prepared.sha256);
    assert.equal(await checksum(prepared.launch_path), prepared.sha256);
    assert.notEqual(dirname(prepared.launch_path), directory);
    assert.match(prepared.macho_uuid, /^[0-9A-F-]{36}$/i);
    assert.equal((await stat(prepared.path)).mode & 0o777, 0o700);
    execFileSync('codesign', ['--verify', '--strict', prepared.path]);
    const entitlements = execFileSync('codesign', ['-d', '--entitlements', '-', '--xml', prepared.path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(entitlements, /<key>com\.apple\.security\.get-task-allow<\/key>\s*<true\s*\/>/);
    assert.equal(execFileSync(prepared.launch_path, { encoding: 'utf8' }), 'profile probe\n');
  } finally {
    if (prepared) await rm(dirname(prepared.launch_path), { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

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
