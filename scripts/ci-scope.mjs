import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Decides whether CI runs, and whether it needs the backend jobs.
 *
 * CI checks major changes and releases, not every commit (Chao, 2026-11-14):
 * - by hand (`gh workflow run ci.yml --ref <branch>`) and on pushes to `main`,
 *   which only changes by a release: everything;
 * - a pull request: unless it changes only documentation;
 * - a push to `v0.7` or `v0.8`: only with a release commit (subject
 *   "Release X.Y.Z") or "[ci]" in a commit message.
 * The backend jobs (Linux, macOS, Windows, about an hour) are skipped when only
 * the frontend and documentation changed, except for a release or `main`.
 */

const NO_PARENT = /^0+$/;
const ROOT_FRONTEND_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);

/** Documentation, including the help pages under `frontend/public/tutorials`. */
export const isDocumentation = (path) =>
  path.endsWith('.md') || path.startsWith('docs/') || path.startsWith('specs/');

/** A change the backend jobs cannot be affected by. */
const isFrontendOnly = (path) =>
  isDocumentation(path) || path.startsWith('frontend/') || ROOT_FRONTEND_FILES.has(path);

/** Unknown files (`null`) need the backend: nothing is skipped on a guess. */
const needsBackend = (files) => files === null || files.some((path) => !isFrontendOnly(path));

/**
 * @param {{
 *   event: string,
 *   ref?: string,
 *   baseRef?: string,
 *   messages?: string[],
 *   files?: string[] | null,
 * }} change
 * @returns {{ run: boolean, backend: boolean, reason: string }}
 */
export function ciScope({ event, ref = '', baseRef = '', messages = [], files = null }) {
  const all = (reason) => ({ run: true, backend: true, reason });
  if (event === 'workflow_dispatch') return all('run by hand');
  if (event === 'push' && ref === 'refs/heads/main') return all('push to main (a release)');
  if (event === 'pull_request') {
    if (baseRef === 'main') return all('pull request into main (a release)');
    if (files !== null && files.every(isDocumentation)) {
      return { run: false, backend: false, reason: 'pull request changes only documentation' };
    }
    return {
      run: true,
      backend: needsBackend(files),
      reason: 'pull request',
    };
  }
  if (event === 'push') {
    if (messages.some((message) => /^Release \d/.test(message))) return all('release commit');
    if (messages.some((message) => message.includes('[ci]'))) {
      return { run: true, backend: needsBackend(files), reason: '[ci] in a commit message' };
    }
    return {
      run: false,
      backend: false,
      reason: 'push without a release commit or [ci]; run it by hand if needed',
    };
  }
  return all(`event ${event}`);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

/** Reads the change from the checkout and the GitHub event values in the environment. */
function readChange(environment) {
  const { EVENT: event, REF: ref, BASE_REF: baseRef, BASE: base, HEAD: head } = environment;
  const known = base && !NO_PARENT.test(base) && head;
  const range = known ? `${base}..${head}` : null;
  let files = null;
  let messages;
  try {
    if (known) files = git('diff', '--name-only', `${base}...${head}`).split('\n').filter(Boolean);
    messages = git('log', '--format=%B%x00', ...(range ? [range] : ['-1', head || 'HEAD']))
      .split('\0')
      .map((message) => message.trim())
      .filter(Boolean);
  } catch {
    // A force push can leave the old commit unreachable: judge the head commit alone.
    files = null;
    messages = [git('log', '-1', '--format=%B', head || 'HEAD').trim()];
  }
  return { event, ref, baseRef, messages, files };
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const scope = ciScope(readChange(process.env));
  const output = `run=${String(scope.run)}\nbackend=${String(scope.backend)}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  const summary = scope.run
    ? `CI runs (${scope.reason})${scope.backend ? '' : ', frontend only'}.`
    : `CI skipped: ${scope.reason}.`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  console.log(summary);
}
