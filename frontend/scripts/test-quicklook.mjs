import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'src-tauri/quicklook');
const output = resolve(root, 'src-tauri/target/quicklook');
const vendor = resolve(output, 'duckdb');
const executable = resolve(output, 'preview-tests');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', timeout: 60000 });

run('xcrun', ['swiftc', '-module-cache-path', `${output}/module-cache`, '-I', vendor, '-L', vendor, '-lduckdb', '-Xlinker', '-rpath', '-Xlinker', vendor,
  `${source}/ProjectPreview.swift`, `${source}/PreviewProvider.swift`, `${source}/Tests/main.swift`, '-o', executable]);
run(executable, [resolve(root, '../backend/src/schema.sql'), resolve(output, 'renderer/preview.js')]);
