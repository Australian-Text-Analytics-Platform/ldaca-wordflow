/** Guard release inputs: optional language payloads belong in the native download cache. */
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export async function verifyLanguageAssets(directory = path.resolve(import.meta.dirname, '../public')) {
  for (const relative of ['models/language-detector.tflite', 'mediapipe/wasm']) {
    try { await access(path.join(directory, relative)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Optional language assets must not be bundled: ${relative}`);
  }
  // Also catch accidentally renamed optional binary payloads.
  for (const file of await readdir(directory, { recursive: true })) {
    if (/\.(tflite|wasm)$/.test(file)) throw new Error(`Optional language asset must be downloaded: ${file}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyLanguageAssets();
