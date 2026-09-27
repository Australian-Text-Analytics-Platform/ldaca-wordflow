#!/usr/bin/env node
/** Verifies distributable assets contain neither fixed local API URLs nor test bridges. */

import { verifyLanguageAssets } from './sync-language-assets.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUILD_DIR = resolve(SCRIPT_DIR, '..', 'build');
const TEXT_ASSET_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
]);
const FORBIDDEN_LOCAL_API_BASE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/api\b/g;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else paths.push(path);
  }
  return paths;
}

/** Returns fixed local API URLs; rejects test bridges in the same asset scan. */
export async function findForbiddenLocalApiBases(buildDirectory) {
  const offenders = [];
  for (const path of await walk(buildDirectory)) {
    if (!TEXT_ASSET_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    const contents = await readFile(path, 'utf8');
    if (/__wdio_(?:original_core|spy|mocks)__|__wordflowDiagnostics/.test(contents)) {
      throw new Error(`Frontend build contains test instrumentation: ${relative(buildDirectory, path)}`);
    }
    FORBIDDEN_LOCAL_API_BASE.lastIndex = 0;
    if (FORBIDDEN_LOCAL_API_BASE.test(contents)) {
      offenders.push(relative(buildDirectory, path));
    }
  }
  return offenders;
}

export async function verifyFrontendBuild(buildDirectory = DEFAULT_BUILD_DIR) {
  await Promise.all(
    ['index.html', 'updater.html'].map(async (entry) => {
      try {
        await readFile(join(buildDirectory, entry), 'utf8');
      } catch {
        throw new Error(`Frontend build is missing required entry point: ${entry}`);
      }
    }),
  );
  await verifyLanguageAssets(buildDirectory);
  const offenders = await findForbiddenLocalApiBases(buildDirectory);
  if (offenders.length > 0) {
    throw new Error(
      `Frontend build contains a fixed local backend API URL: ${offenders.join(', ')}`,
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await verifyFrontendBuild();
  console.log('Frontend build backend-location contract passed.');
}
