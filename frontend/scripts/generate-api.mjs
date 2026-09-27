import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import openapiTS, { astToString } from 'openapi-typescript';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(frontend);
const check = process.argv.includes('--check');
function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: frontend, encoding: 'utf8', input, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr ?? `${command} failed`);
  return result.stdout;
}
const schema = JSON.parse(run('cargo', [
  'run', '--quiet', '--locked', '--manifest-path', path.join(root, 'server/Cargo.toml'),
  '--bin', 'export-server-openapi',
]));
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, ordered(value[key])]),
  );
  return value;
}
const json = `${JSON.stringify(ordered(schema), null, 2)}\n`;
const types = astToString(await openapiTS(JSON.parse(json), { arrayLength: true, defaultNonNullable: false }));
const require = createRequire(import.meta.url);
const notice = '/** Generated from backend/openapi.json. Run pnpm api:generate; do not edit. */\n';
const generated = run(process.execPath, [require.resolve('@biomejs/biome/bin/biome'), 'format', '--stdin-file-path=src/api/generated/native.ts'], notice + types);
const outputs = [[path.join(root, 'backend/openapi.json'), json],
  [path.join(frontend, 'src/api/generated/native.ts'), generated]];
let changed = false;
for (const [file, content] of outputs) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) continue;
  changed = true;
  if (check) console.error(`Outdated generated contract: ${path.relative(root, file)}`);
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`Generated ${path.relative(root, file)}`);
  }
}
if (check && changed) {
  console.error('Run pnpm api:generate and review both generated artifacts.');
  process.exitCode = 1;
}
