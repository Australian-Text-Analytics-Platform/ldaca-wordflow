import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'src-tauri/quicklook');
const output = resolve(root, 'src-tauri/target/quicklook');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', cwd: root });

export function validateDuckDBVersion(pin, lock) {
  const rust = lock.match(/name = "libduckdb-sys"\nversion = "(\d+)\.(\d+)[^"]*"/);
  const [, major, encoded] = rust ?? [];
  const minor = Math.floor((Number(encoded) % 10000) / 100);
  const patch = Number(encoded) % 100;
  if (!rust || pin.version !== `${major}.${minor}.${patch}`) {
    throw new Error('Quick Look DuckDB must match the backend engine version. Update the pinned download and checksum.');
  }
}

export async function buildQuickLook() {
  if (process.platform !== 'darwin') throw new Error('Quick Look is a macOS-only build.');
  const pin = JSON.parse(await readFile(resolve(source, 'duckdb.json'), 'utf8'));
  validateDuckDBVersion(pin, await readFile(resolve(root, '../Cargo.lock'), 'utf8'));
  const vendor = resolve(output, 'duckdb');
  await mkdir(vendor, { recursive: true });
  const archive = resolve(output, 'duckdb.zip');
  let bytes;
  try { bytes = await readFile(archive); } catch { /* Download the pinned archive on a clean build. */ }
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) {
    run('curl', ['--fail', '--location', '--retry', '2', pin.url, '--output', archive]);
    bytes = await readFile(archive);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== pin.sha256) {
    throw new Error('DuckDB download checksum mismatch.');
  }
  run('unzip', ['-o', '-q', archive, '-d', vendor]);
  await copyFile(resolve(source, 'module.modulemap'), resolve(vendor, 'module.modulemap'));
  run('install_name_tool', ['-id', '@rpath/libduckdb.dylib', resolve(vendor, 'libduckdb.dylib')]);
  // The build owns this verified copy. Its final signature is applied after embedding.
  run('codesign', ['--force', '--sign', '-', resolve(vendor, 'libduckdb.dylib')]);
  await build({
    configFile: false, root,
    build: { outDir: resolve(output, 'renderer'), emptyOutDir: true, target: 'es2021',
      lib: { entry: resolve(root, 'src/features/quicklook/render.ts'), name: 'WordflowPreview', formats: ['iife'], fileName: () => 'preview.js' },
    },
  });
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  run('xcodebuild', ['-project', resolve(source, 'WordflowPreview.xcodeproj'), '-scheme', 'WordflowPreview', '-derivedDataPath', `${output}/xcode`,
    '-configuration', 'Release', 'build', `QUICKLOOK_BUILD_DIR=${output}`, `CONFIGURATION_BUILD_DIR=${output}/products`,
    `SYMROOT=${output}/xcode`, `OBJROOT=${output}/xcode`, `MARKETING_VERSION=${version}`, `CURRENT_PROJECT_VERSION=${version}`,
    `CLANG_MODULE_CACHE_PATH=${output}/module-cache`, 'CODE_SIGNING_ALLOWED=NO', 'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=NO']);
  const extension = resolve(output, 'products/WordflowPreview.appex');
  const identity = process.env.APPLE_SIGNING_IDENTITY || '-';
  const signing = identity === '-' ? [] : ['--options', 'runtime', '--timestamp'];
  run('codesign', ['--force', ...signing, '--sign', identity, `${extension}/Contents/Frameworks/libduckdb.dylib`]);
  run('codesign', ['--force', ...signing, '--sign', identity, '--entitlements', resolve(source, 'entitlements.plist'), extension]);
  run('codesign', ['--verify', '--strict', '--deep', extension]);
  await writeFile(resolve(output, 'version.json'), JSON.stringify({ application: version, duckdb: pin.version }));
  console.log(`Built Quick Look extension: ${extension}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildQuickLook();
