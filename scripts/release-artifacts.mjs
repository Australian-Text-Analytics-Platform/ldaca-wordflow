/** Production package evidence and nonpublishing promotion validation. */
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSION_TARGETS, versionFromReleaseTag } from './version-targets.mjs';

export const BUILD_WORKFLOW = '.github/workflows/release-build.yml';
export const PACKAGES = {
  'ldaca-desktop-windows-msi': ['ldaca-wordflow_windows-x86_64.msi', 'ldaca-wordflow_windows-x86_64.msi.sig'],
  'ldaca-desktop-macos-apple-silicon': ['ldaca-wordflow_darwin-aarch64.dmg', 'ldaca-wordflow_darwin-aarch64.app.tar.gz', 'ldaca-wordflow_darwin-aarch64.app.tar.gz.sig'],
  'wordflow-server-x86_64-unknown-linux-gnu': ['wordflow-server-x86_64-unknown-linux-gnu.tar.gz', 'wordflow-server-x86_64-unknown-linux-gnu.tar.gz.sha256'],
  'wordflow-server-aarch64-apple-darwin': ['wordflow-server-aarch64-apple-darwin.tar.gz', 'wordflow-server-aarch64-apple-darwin.tar.gz.sha256'],
  'wordflow-server-x86_64-pc-windows-msvc': ['wordflow-server-x86_64-pc-windows-msvc.zip', 'wordflow-server-x86_64-pc-windows-msvc.zip.sha256'],
};
const MANIFEST = 'release-package.json';
function requireThat(value, message) {
  if (!value) throw new Error(message);
}
async function digest(path, algorithm = 'sha256') {
  const hash = createHash(algorithm);
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, hash: hash.digest() };
}
async function packageFiles(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(resolve(directory, relative), { withFileTypes: true })) {
    requireThat(!entry.isSymbolicLink(), 'Release packages cannot contain links');
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await packageFiles(directory, path));
    else {
      requireThat(entry.isFile(), 'Release packages must contain ordinary files');
      if (path !== MANIFEST) files.push(path);
    }
  }
  return files.sort();
}

/** Called after each reusable build, using its actual checkout and build profile. */
export async function recordPackage(artifact, directory, identity) {
  const expected = PACKAGES[artifact];
  requireThat(expected, `Unknown production package: ${artifact}`);
  const paths = await packageFiles(directory);
  requireThat(JSON.stringify(paths.map((path) => basename(path)).sort()) === JSON.stringify([...expected].sort()), `Incomplete or unexpected files in ${artifact}`);
  const files = [];
  for (const path of paths) {
    const { size, hash } = await digest(resolve(directory, path));
    requireThat(size > 0, `Empty release file: ${path}`);
    files.push({ path, size, sha256: hash.toString('hex') });
  }
  const manifest = { schema: 1, artifact, ...identity, files };
  await writeFile(resolve(directory, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Same ED/Ed packets and trusted-comment check used by Tauri's minisign verifier. */
export async function verifyUpdaterSignature(file, encodedSignature, encodedPublicKey) {
  const keyLines = Buffer.from(encodedPublicKey.trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
  const key = Buffer.from(keyLines[1] ?? '', 'base64');
  const lines = Buffer.from(encodedSignature.trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
  const packet = Buffer.from(lines[1] ?? '', 'base64');
  const global = Buffer.from(lines[3] ?? '', 'base64');
  requireThat(key.length === 42 && packet.length === 74 && global.length === 64 && lines[2]?.startsWith('trusted comment: '), 'Invalid updater signature encoding');
  requireThat(['Ed', 'ED'].includes(key.subarray(0, 2).toString()) && ['Ed', 'ED'].includes(packet.subarray(0, 2).toString()), 'Unsupported updater signature algorithm');
  requireThat(key.subarray(2, 10).equals(packet.subarray(2, 10)), 'Updater signing key does not match');
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
    format: 'der', type: 'spki',
  });
  const message = packet.subarray(0, 2).toString() === 'ED'
    ? (await digest(file, 'blake2b512')).hash
    : await readFile(file);
  requireThat(verify(null, message, publicKey, packet.subarray(10)), 'Updater package signature is invalid');
  requireThat(verify(null, Buffer.concat([packet.subarray(10), Buffer.from(lines[2].slice(17))]), publicKey, global), 'Updater trusted comment signature is invalid');
}

/** Validates everything before creating any release or changing public assets. */
export async function validatePromotion({ run, artifacts, directory, repository, requestedRunId, currentRunId, sourceCommit, version, tag, publicKey, now = Date.now() }) {
  requireThat(String(run.id) === String(requestedRunId) && String(run.id) !== String(currentRunId), 'Select a previous production build run');
  requireThat(run.path === BUILD_WORKFLOW && run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'success', 'Run is not a successful production release build');
  requireThat(run.repository?.full_name === repository && Date.parse(run.updated_at) < now, 'Build repository or completion time does not match');
  requireThat(versionFromReleaseTag(tag) === version && /^[a-f0-9]{40}$/.test(sourceCommit), 'Release tag/version/commit identity is invalid');
  const packages = [];
  for (const [name, expected] of Object.entries(PACKAGES)) {
    const matches = artifacts.filter((artifact) => artifact.name === name);
    requireThat(matches.length === 1 && !matches[0].expired && Date.parse(matches[0].expires_at) > now, `Required artifact is missing, expired or ambiguous: ${name}`);
    const root = resolve(directory, name);
    const manifest = JSON.parse(await readFile(resolve(root, MANIFEST), 'utf8'));
    requireThat(manifest.schema === 1 && manifest.artifact === name && manifest.repository === repository && manifest.workflowPath === BUILD_WORKFLOW && manifest.workflowCommit === run.head_sha && String(manifest.runId) === String(run.id) && Number(manifest.runAttempt) === Number(run.run_attempt), `Build identity does not match: ${name}`);
    requireThat(manifest.sourceCommit === sourceCommit && manifest.version === version && manifest.profile === 'release' && manifest.applicationId === 'au.edu.ldaca.wordflow' && manifest.instrumented === false, `Source, version or production profile does not match: ${name}`);
    const paths = await packageFiles(root);
    requireThat(JSON.stringify(paths.map((path) => basename(path)).sort()) === JSON.stringify([...expected].sort()) && manifest.files.length === paths.length, `Incomplete package: ${name}`);
    for (const path of paths) {
      const evidence = manifest.files.filter((file) => file.path === path);
      const { size, hash } = await digest(resolve(root, path));
      requireThat(evidence.length === 1 && size > 0 && evidence[0].size === size && evidence[0].sha256 === hash.toString('hex'), `Artifact bytes do not match: ${name}/${path}`);
      if (path.endsWith('.sig')) {
        await verifyUpdaterSignature(resolve(root, path.slice(0, -4)), await readFile(resolve(root, path), 'utf8'), publicKey);
      } else if (path.endsWith('.sha256')) {
        const archive = path.slice(0, -7);
        const archiveHash = (await digest(resolve(root, archive))).hash.toString('hex');
        requireThat((await readFile(resolve(root, path), 'utf8')).trim() === `${archiveHash}  ${basename(archive)}`, `Server checksum does not match: ${name}`);
      }
    }
    packages.push({ ...manifest, artifactId: matches[0].id });
  }
  requireThat(artifacts.every((artifact) => Object.hasOwn(PACKAGES, artifact.name)), 'Production build contains unexpected artifacts');
  return { schema: 1, repository, runId: run.id, runAttempt: run.run_attempt, sourceCommit, version, tag, packages };
}

export async function preparePromotion(evidence, directory, output, now = new Date()) {
  await mkdir(output, { recursive: true });
  const checksums = [];
  for (const manifest of evidence.packages) {
    for (const file of manifest.files) {
      const name = basename(file.path);
      const destination = resolve(output, name);
      await cp(resolve(directory, manifest.artifact, file.path), destination, { errorOnExist: true, force: false });
      const copied = await digest(destination);
      requireThat(copied.hash.toString('hex') === file.sha256, `Copied bytes do not match: ${name}`);
      checksums.push(`${file.sha256}  ${name}`);
    }
  }
  await writeFile(resolve(output, 'SHA256SUMS'), `${checksums.sort().join('\n')}\n`);
  await writeFile(resolve(output, 'server-SHA256SUMS'), `${checksums.filter((line) => /  wordflow-server-.*\.(tar\.gz|zip)$/.test(line)).sort().join('\n')}\n`);
  await writeFile(resolve(output, 'release-build.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  const base = `https://github.com/${evidence.repository}/releases/download/${encodeURIComponent(evidence.tag)}`;
  const platforms = {};
  for (const [platform, file] of [['windows-x86_64', 'ldaca-wordflow_windows-x86_64.msi'], ['darwin-aarch64', 'ldaca-wordflow_darwin-aarch64.app.tar.gz']]) {
    platforms[platform] = { signature: (await readFile(resolve(output, `${file}.sig`), 'utf8')).trim(), url: `${base}/${file}` };
  }
  await writeFile(resolve(output, 'latest.json'), `${JSON.stringify({ version: evidence.version, notes: `Wordflow ${evidence.version}`, pub_date: now.toISOString(), platforms }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  const env = process.env;
  const config = JSON.parse(await readFile('frontend/src-tauri/tauri.conf.json', 'utf8'));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (command === 'record') {
    const [artifact, directory, profile] = args;
    await recordPackage(artifact, directory, {
      sourceCommit, version: config.version, applicationId: config.identifier, profile,
      instrumented: false, repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID,
      runAttempt: Number(env.GITHUB_RUN_ATTEMPT), workflowCommit: env.GITHUB_WORKFLOW_SHA,
      workflowPath: env.GITHUB_WORKFLOW_REF?.split('@')[0].replace(`${env.GITHUB_REPOSITORY}/`, ''),
    });
  } else if (command === 'prepare') {
    const [directory, output, runFile, artifactsFile, tag, requestedRunId] = args;
    const tagCommit = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { encoding: 'utf8' }).trim();
    requireThat(tagCommit === sourceCommit, 'Checked-out source does not match the release tag');
    for (const target of VERSION_TARGETS) {
      requireThat(target.extract(await readFile(target.path, 'utf8')) === config.version, `Release version drift: ${target.label}`);
    }
    const evidence = await validatePromotion({
      run: JSON.parse(await readFile(runFile, 'utf8')), artifacts: JSON.parse(await readFile(artifactsFile, 'utf8')),
      directory, repository: env.GITHUB_REPOSITORY, requestedRunId, currentRunId: env.GITHUB_RUN_ID,
      sourceCommit, version: config.version, tag, publicKey: config.plugins.updater.pubkey,
    });
    await preparePromotion(evidence, directory, output);
  } else throw new Error('Usage: release-artifacts.mjs record <artifact> <directory> <profile> | prepare <directory> <output> <run.json> <artifacts.json> <tag> <build-run-id>');
}
