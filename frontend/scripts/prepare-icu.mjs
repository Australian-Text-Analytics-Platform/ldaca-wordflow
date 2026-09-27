/** Build-time provisioning only. DuckDB checks the extension signature when loading. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
const version = 'v1.5.5';
const arguments_ = process.argv.slice(2);
const argument = (name) => { const index = arguments_.indexOf(name); return index < 0 ? undefined : arguments_[index + 1]; };
const target = argument('--target') ?? process.env.TAURI_ENV_TARGET_TRIPLE;
const targetPlatforms = {
  'aarch64-apple-darwin': 'osx_arm64',
  'x86_64-apple-darwin': 'osx_amd64',
  'x86_64-pc-windows-msvc': 'windows_amd64',
  'x86_64-unknown-linux-gnu': 'linux_amd64',
  'aarch64-unknown-linux-gnu': 'linux_arm64',
};
const platform = target
  ? targetPlatforms[target]
  : {
      'darwin-arm64': 'osx_arm64',
      'darwin-x64': 'osx_amd64',
      'win32-x64': 'windows_amd64',
      'linux-x64': 'linux_amd64',
      'linux-arm64': 'linux_arm64',
    }[`${process.platform}-${process.arch}`];
if (!platform)
  throw new Error(`Unsupported ICU target: ${target ?? process.platform + '-' + process.arch}`);

const root = path.resolve(argument('--output-dir') ?? fileURLToPath(new URL('../src-tauri/resources/icu/', import.meta.url)));
const filename = 'icu.duckdb_extension';
const source =
  process.env.WORDFLOW_ICU_SOURCE ??
  path.join(homedir(), '.duckdb/extensions', version, platform, filename);
const url = `https://extensions.duckdb.org/${version}/${platform}/${filename}.gz`;
let bytes;
try {
  bytes = await readFile(source);
} catch {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ICU provisioning failed: ${response.status} ${url}`);
  bytes = gunzipSync(Buffer.from(await response.arrayBuffer()));
}
// DuckDB's signed extension footer includes fixed-width version and platform fields.
const footer = bytes.subarray(-512, -256).toString('utf8').split('\0').filter(Boolean);
if (!footer.includes(version) || !footer.includes(platform))
  throw new Error(`ICU asset does not match ${version}/${platform}`);
await mkdir(root, { recursive: true });
await writeFile(path.join(root, filename), bytes);
await writeFile(
  path.join(root, 'manifest.json'),
  JSON.stringify(
    { version, platform, url, sha256: createHash('sha256').update(bytes).digest('hex') },
    null,
    2,
  ) + '\n',
);
console.log(`Provisioned signed ICU ${version}/${platform}`);
