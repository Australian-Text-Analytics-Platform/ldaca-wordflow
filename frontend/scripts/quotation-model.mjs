import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The native extractor owns the pinned model identity; do not maintain another inventory.
export async function quotationModel() {
  const source = await readFile(new URL('../../ldaca-rs/src/quotation/mod.rs', import.meta.url), 'utf8');
  const constant = (name) => {
    const value = source.match(new RegExp(`pub const ${name}: &str = "([^"]+)";`))?.[1];
    if (!value) throw new Error(`Cannot read native Quotation constant ${name}`);
    return value;
  };
  return { filename: constant('MODEL_FILENAME'), url: constant('MODEL_URL'), sha256: constant('MODEL_SHA256') };
}

export function quotationModelPath(filename, env = process.env, platform = process.platform) {
  if (env.WORDFLOW_QUOTATION_MODEL) return env.WORDFLOW_QUOTATION_MODEL;
  const root = platform === 'darwin'
    ? env.HOME && join(env.HOME, 'Library/Caches')
    : platform === 'win32'
      ? env.LOCALAPPDATA
      : env.XDG_CACHE_HOME || (env.HOME && join(env.HOME, '.cache'));
  if (!root) throw new Error('Cannot locate the model cache. Set WORDFLOW_QUOTATION_MODEL to an absolute model path.');
  return join(root, 'au.edu.ldaca.wordflow/udpipe', filename);
}

function verify(bytes, sha256) {
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error('Quotation model checksum is invalid');
  }
}

export async function requireQuotationModel(model = undefined, path = undefined) {
  model ??= await quotationModel();
  path ??= quotationModelPath(model.filename);
  try {
    verify(await readFile(path), model.sha256);
  } catch (cause) {
    throw new Error(
      `Quotation E2E requires the pinned UDPipe model at ${path}. Run pnpm prepare:e2e:models from the repository root, or set WORDFLOW_QUOTATION_MODEL to a valid model file. (${cause.message})`,
      { cause },
    );
  }
  return path;
}

export async function prepareQuotationModel(model = undefined, path = undefined, download = fetch) {
  model ??= await quotationModel();
  path ??= quotationModelPath(model.filename);
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (bytes && createHash('sha256').update(bytes).digest('hex') === model.sha256) return path;
  const response = await download(model.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Quotation model download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  verify(bytes, model.sha256);
  await mkdir(dirname(path), { recursive: true });
  const staging = await mkdtemp(join(dirname(path), '.quotation-model-'));
  try {
    const file = join(staging, model.filename);
    await writeFile(file, bytes);
    await rename(file, path);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Quotation model ready: ${await prepareQuotationModel()}`);
}
