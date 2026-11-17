import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Decides, for each of our own Rust packages, whether CI installs its
 * published wheel or builds it from the checked-out submodule.
 *
 * Building polars-text and polars-source-utils from source took 36 to 60
 * minutes of every backend job; the tests take 2 to 5 (Chao, 2026-11-17: speed
 * up what we fully control; keep uv.lock for every external package; v0.7 and
 * so main only, v0.8 may differ). A package uses its wheel only when the
 * submodule points at exactly the commit its release tag `v<version>` names
 * and PyPI has a wheel for this runner. That wheel was built from the same
 * code, so nothing is tested less. Any other case, such as an unreleased
 * commit, a moved tag, no wheel for this platform or a failed lookup, builds
 * from source as before.
 */

export const OWN_PACKAGES = [
  { name: 'polars-text', dir: 'polars-text' },
  { name: 'polars-source-utils', dir: 'polars-source-utils' },
];

/** The wheel tags each CI runner can install. */
const PLATFORM_WHEELS = {
  'linux-x64': /manylinux[^-]*_x86_64\.whl$/,
  'darwin-arm64': /macosx_[^-]*_(arm64|universal2)\.whl$/,
  'win32-x64': /win_amd64\.whl$/,
};

/** `3.14` -> `cp314`. */
export const pythonTag = (version) => `cp${String(version).split('.').slice(0, 2).join('')}`;

/** Whether a published wheel installs on this runner and Python. */
export function wheelFitsRunner(filename, { platform, arch, python }) {
  const pattern = PLATFORM_WHEELS[`${platform}-${arch}`];
  if (!pattern || !pattern.test(filename)) return false;
  const tag = pythonTag(python);
  // A stable-ABI (abi3) wheel serves every later Python too.
  return filename.includes(`-${tag}-${tag}-`) || /-abi3-/.test(filename);
}

/**
 * @param {{
 *   name: string,
 *   version: string | null,
 *   gitlink: string | null,
 *   tagCommit: string | null,
 *   wheels: string[] | null,
 * }} pkg what the submodule, its release tag and PyPI say
 * @param {{ platform: string, arch: string, python: string }} runner
 * @returns {{ name: string, version: string | null, mode: 'wheel' | 'source', reason: string }}
 */
export function chooseSource(pkg, runner) {
  const source = (reason) => ({ name: pkg.name, version: pkg.version, mode: 'source', reason });
  if (!pkg.version) return source('no version in its pyproject.toml');
  if (!pkg.gitlink) return source('the submodule commit is unknown');
  if (!pkg.tagCommit) return source(`no release tag v${pkg.version}`);
  if (pkg.tagCommit !== pkg.gitlink) {
    return source(`the submodule is not at v${pkg.version} (${pkg.gitlink.slice(0, 8)} vs ${pkg.tagCommit.slice(0, 8)})`);
  }
  if (pkg.wheels === null) return source(`PyPI could not be asked about ${pkg.version}`);
  if (!pkg.wheels.some((file) => wheelFitsRunner(file, runner))) {
    return source(`no ${pythonTag(runner.python)} wheel of ${pkg.version} for ${runner.platform}-${runner.arch}`);
  }
  return { name: pkg.name, version: pkg.version, mode: 'wheel', reason: `v${pkg.version} wheel from PyPI` };
}

/** The step outputs the workflow reads. */
export function workflowOutputs(choices) {
  const wheels = choices.filter((choice) => choice.mode === 'wheel');
  return {
    sync_args: wheels.map((choice) => `--no-install-package ${choice.name}`).join(' '),
    wheels: wheels.map((choice) => `${choice.name}==${choice.version}`).join(' '),
    rust: String(choices.some((choice) => choice.mode === 'source')),
  };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function projectVersion(root, dir) {
  try {
    const text = readFileSync(join(root, dir, 'pyproject.toml'), 'utf8');
    return text.match(/^\[project\][^[]*?^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function releaseTagCommit(url, version) {
  try {
    const lines = git('ls-remote', '--tags', url, `refs/tags/v${version}`, `refs/tags/v${version}^{}`)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'));
    // An annotated tag's own object is not a commit; its peeled line (^{}) is.
    const peeled = lines.find(([, ref]) => ref.endsWith('^{}'));
    return (peeled ?? lines[0])?.[0] ?? null;
  } catch {
    return null;
  }
}

async function publishedWheels(name, version) {
  try {
    const response = await fetch(`https://pypi.org/pypi/${name}/${version}/json`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return [];
    if (!response.ok) return null;
    const release = await response.json();
    return release.urls.map((file) => file.filename).filter((file) => file.endsWith('.whl'));
  } catch {
    return null;
  }
}

async function readPackage(root, { name, dir }) {
  const version = projectVersion(root, dir);
  let gitlink = null;
  let url = null;
  try {
    gitlink = git('rev-parse', `HEAD:${dir}`);
    url = git('config', '-f', join(root, '.gitmodules'), '--get', `submodule.${dir}.url`);
  } catch {
    // Unknown: chooseSource builds from source.
  }
  return {
    name,
    version,
    gitlink,
    tagCommit: version && url ? releaseTagCommit(url, version) : null,
    wheels: version ? await publishedWheels(name, version) : null,
  };
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const runner = {
    platform: process.platform,
    arch: process.arch,
    python: process.env.PYTHON_VERSION || '3.14',
  };
  const root = git('rev-parse', '--show-toplevel');
  const choices = [];
  for (const pkg of OWN_PACKAGES) choices.push(chooseSource(await readPackage(root, pkg), runner));
  const outputs = workflowOutputs(choices);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  }
  const lines = choices.map(
    (choice) => `- ${choice.name}: ${choice.mode === 'wheel' ? 'published wheel' : 'built from source'} (${choice.reason})`,
  );
  const summary = `Our Rust packages on ${runner.platform}-${runner.arch}:\n${lines.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary.trimEnd());
}
