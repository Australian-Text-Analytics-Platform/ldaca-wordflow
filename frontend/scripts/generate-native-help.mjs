import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLED_REGISTRY, TUTORIAL_INDEX_TARGET } from '../src/tutorials/bundledRegistry.ts';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(frontend, 'src-tauri/generated/help-index.json');
/** Materialise the canonical bundled registry for AppKit, without a second authored index. */
export async function nativeHelpIndex() {
  const topics = [{kind: 'tutorial', key: 'index', ...TUTORIAL_INDEX_TARGET},
    ...Object.entries(BUNDLED_REGISTRY).flatMap(([kind, section]) =>
      Object.entries(section).map(([key, target]) => ({kind, key, ...target})))];
  const unique = new Map();
  for (const topic of topics) {
    const markdown = await readFile(resolve(frontend, 'public', topic.file), 'utf8');
    const heading = [/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(markdown), /^#{1,6}\s+(.+)$/m.exec(markdown)]
      .filter(Boolean).sort((left,right)=>left.index-right.index)[0];
    const page = heading?.[1]?.replace(/<[^>]+>/g,'').trim();
    if (!page) throw new Error(`Bundled document needs a primary heading: ${topic.file}`);
    const label = topic.label ?? page;
    const title = label.toLowerCase().includes(page.toLowerCase()) ? label : `${page} — ${label}`;
    const identity = `${topic.kind}:${topic.file}#${topic.anchor}`;
    if (!unique.has(identity)) unique.set(identity, {...topic, title});
  }
  return `${JSON.stringify([...unique.values()], null, 2)}\n`;
}
export async function checkNativeHelpIndex() {
  const expected = await nativeHelpIndex();
  const actual = await readFile(output, 'utf8').catch(() => '');
  if (actual !== expected) throw new Error('Native bundled Help index is outdated. Run node scripts/generate-native-help.mjs.');
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  if (process.argv.includes('--check')) await checkNativeHelpIndex();
  else { await mkdir(dirname(output), {recursive: true}); await writeFile(output, await nativeHelpIndex()); }
}
