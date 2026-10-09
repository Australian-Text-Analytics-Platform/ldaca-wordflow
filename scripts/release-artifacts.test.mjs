import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BUILD_WORKFLOW, PACKAGES, preparePromotion, recordPackage, validatePromotion } from './release-artifacts.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wordflow-promotion-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = Buffer.from('12345678');
  const key = Buffer.concat([Buffer.from('Ed'), keyId, publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)]);
  const encodedKey = Buffer.from(`untrusted comment: fixture\n${key.toString('base64')}\n`).toString('base64');
  const signature = (bytes) => {
    const raw = sign(null, createHash('blake2b512').update(bytes).digest(), privateKey);
    const packet = Buffer.concat([Buffer.from('ED'), keyId, raw]);
    const comment = 'timestamp:123456 fixture';
    const global = sign(null, Buffer.concat([raw, Buffer.from(comment)]), privateKey);
    return Buffer.from(`untrusted comment: fixture\n${packet.toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`).toString('base64');
  };
  const identity = {
    sourceCommit: 'a'.repeat(40), version: '8.0.0', applicationId: 'au.edu.ldaca.wordflow',
    profile: 'release', instrumented: false, repository: 'example/wordflow', runId: '123',
    runAttempt: 2, workflowPath: BUILD_WORKFLOW, workflowCommit: 'b'.repeat(40),
  };
  for (const [artifact, names] of Object.entries(PACKAGES)) {
    const directory = join(root, artifact);
    await mkdir(directory);
    for (const name of names) {
      const bytes = Buffer.from(`original production bytes for ${name}`);
      const content = name.endsWith('.sig')
        ? signature(await readFile(join(directory, name.slice(0, -4))))
        : name.endsWith('.sha256')
          ? `${createHash('sha256').update(await readFile(join(directory, name.slice(0, -7)))).digest('hex')}  ${name.slice(0, -7)}\n`
          : bytes;
      await writeFile(join(directory, name), content);
    }
    await recordPackage(artifact, directory, identity);
  }
  return {
    directory: root, repository: identity.repository, requestedRunId: '123', currentRunId: '456',
    sourceCommit: identity.sourceCommit, version: identity.version, tag: 'v8.0.0', publicKey: encodedKey,
    now: Date.parse('2026-10-10T00:00:00Z'),
    run: { id: 123, run_attempt: 2, head_sha: identity.workflowCommit, path: BUILD_WORKFLOW, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', repository: { full_name: identity.repository }, updated_at: '2026-10-09T00:00:00Z' },
    artifacts: Object.keys(PACKAGES).map((name, index) => ({ id: index + 1, name, expired: false, expires_at: '2026-12-01T00:00:00Z' })),
  };
}

test('promotes every original byte using the resolved source commit, independently of the workflow head', async (t) => {
  const input = await fixture(t);
  const evidence = await validatePromotion(input);
  assert.notEqual(evidence.sourceCommit, input.run.head_sha);
  const output = join(input.directory, 'promotion');
  await preparePromotion(evidence, input.directory, output, new Date(input.now));
  for (const [artifact, names] of Object.entries(PACKAGES)) {
    for (const name of names) assert.deepEqual(await readFile(join(output, name)), await readFile(join(input.directory, artifact, name)));
  }
  const updater = JSON.parse(await readFile(join(output, 'latest.json'), 'utf8'));
  assert.equal(updater.version, '8.0.0');
  assert.deepEqual(Object.keys(updater.platforms).sort(), ['darwin-aarch64', 'windows-x86_64']);
  assert.equal(updater.platforms['windows-x86_64'].signature, (await readFile(join(output, 'ldaca-wordflow_windows-x86_64.msi.sig'), 'utf8')).trim());
  assert.match(await readFile(join(output, 'SHA256SUMS'), 'utf8'), /ldaca-wordflow_darwin-aarch64.dmg/);
});

test('refuses current, ordinary CI, unsuccessful, incomplete and expired runs', async (t) => {
  const input = await fixture(t);
  const invalid = [
    { currentRunId: '123' }, { requestedRunId: '999' },
    { run: { ...input.run, path: '.github/workflows/ci.yml' } },
    { run: { ...input.run, event: 'push' } },
    { run: { ...input.run, conclusion: 'failure' } },
    { run: { ...input.run, status: 'in_progress' } },
    { run: { ...input.run, repository: { full_name: 'other/repository' } } },
    { artifacts: input.artifacts.slice(1) },
    { artifacts: input.artifacts.map((artifact, i) => i ? artifact : { ...artifact, expired: true }) },
    { artifacts: input.artifacts.map((artifact, i) => i ? artifact : { ...artifact, expires_at: '2026-10-01T00:00:00Z' }) },
    { artifacts: [...input.artifacts, { ...input.artifacts[0], name: 'ldaca-desktop-windows-msi-debug' }] },
    { tag: 'v8.0.1' }, { sourceCommit: 'c'.repeat(40) },
  ];
  for (const patch of invalid) await assert.rejects(validatePromotion({ ...input, ...patch }));
});

test('refuses mismatched identity, debug/instrumented packages and changed bytes', async (t) => {
  const input = await fixture(t);
  const name = Object.keys(PACKAGES)[0];
  const path = join(input.directory, name, 'release-package.json');
  const original = JSON.parse(await readFile(path, 'utf8'));
  for (const patch of [{ runId: '999' }, { runAttempt: 1 }, { workflowCommit: 'c'.repeat(40) }, { workflowPath: '.github/workflows/desktop-build.yml' }, { profile: 'debug' }, { instrumented: true }, { applicationId: 'au.edu.ldaca.wordflow.test' }, { version: '8.0.1' }]) {
    await writeFile(path, JSON.stringify({ ...original, ...patch }));
    await assert.rejects(validatePromotion(input));
  }
  await writeFile(path, JSON.stringify(original));
  await writeFile(join(input.directory, name, PACKAGES[name][0]), 'changed package');
  await assert.rejects(validatePromotion(input), /bytes do not match/);
});

test('checks signatures cryptographically even if package digests were regenerated', async (t) => {
  const input = await fixture(t);
  const name = Object.keys(PACKAGES)[0];
  const directory = join(input.directory, name);
  const identity = JSON.parse(await readFile(join(directory, 'release-package.json'), 'utf8'));
  await writeFile(join(directory, PACKAGES[name][0]), 'changed package');
  delete identity.files;
  await recordPackage(name, directory, identity);
  await assert.rejects(validatePromotion(input), /signature is invalid/);
});

test('refuses missing signature files, links and unexpected package members', async (t) => {
  const input = await fixture(t);
  const name = Object.keys(PACKAGES)[0];
  await rm(join(input.directory, name, PACKAGES[name][1]));
  await assert.rejects(validatePromotion(input), /Incomplete package/);
  const linked = await fixture(t);
  await symlink(join(linked.directory, name, PACKAGES[name][0]), join(linked.directory, name, 'linked.msi'));
  await assert.rejects(validatePromotion(linked), /cannot contain links/);
  const extra = await fixture(t);
  await writeFile(join(extra.directory, name, 'debug.log'), 'unexpected');
  await assert.rejects(validatePromotion(extra), /Incomplete package/);
});

test('rejects a wrong updater key and a modified trusted comment', async (t) => {
  const input = await fixture(t);
  const other = await fixture(t);
  await assert.rejects(validatePromotion({ ...input, publicKey: other.publicKey }), /signature is invalid/);
  const artifact = 'ldaca-desktop-windows-msi';
  const directory = join(input.directory, artifact);
  const path = join(directory, PACKAGES[artifact].find((name) => name.endsWith('.sig')));
  const signature = Buffer.from(await readFile(path, 'utf8'), 'base64').toString('utf8');
  await writeFile(path, Buffer.from(signature.replace('trusted comment: timestamp:123456 fixture', 'trusted comment: timestamp:999999 changed')).toString('base64'));
  const identity = JSON.parse(await readFile(join(directory, 'release-package.json'), 'utf8'));
  delete identity.files;
  await recordPackage(artifact, directory, identity);
  await assert.rejects(validatePromotion(input), /trusted comment signature is invalid/);
});
