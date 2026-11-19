import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseSource, pythonTag, wheelFitsRunner, workflowOutputs } from './ci-own-wheels.mjs';

const LINUX = { platform: 'linux', arch: 'x64', python: '3.14' };
const MAC = { platform: 'darwin', arch: 'arm64', python: '3.14' };
const WINDOWS = { platform: 'win32', arch: 'x64', python: '3.14' };
const COMMIT = 'f0e8fe1d9169918d558ef31796e3aa06560ec22c';
const WHEELS = [
  'polars_text-0.7.3-cp314-cp314-macosx_11_0_arm64.whl',
  'polars_text-0.7.3-cp314-cp314-manylinux_2_28_x86_64.whl',
  'polars_text-0.7.3-cp314-cp314-win_amd64.whl',
];
const released = (overrides = {}) => ({
  name: 'polars-text',
  version: '0.7.3',
  gitlink: COMMIT,
  tagCommit: COMMIT,
  wheels: WHEELS,
  ...overrides,
});

test('python versions become wheel tags', () => {
  assert.equal(pythonTag('3.14'), 'cp314');
  assert.equal(pythonTag('3.14.5'), 'cp314');
});

test('each runner finds its own wheel only', () => {
  assert.equal(wheelFitsRunner(WHEELS[1], LINUX), true);
  assert.equal(wheelFitsRunner(WHEELS[0], MAC), true);
  assert.equal(wheelFitsRunner(WHEELS[2], WINDOWS), true);
  assert.equal(wheelFitsRunner(WHEELS[0], LINUX), false);
  assert.equal(wheelFitsRunner(WHEELS[1], { ...LINUX, python: '3.13' }), false);
  assert.equal(wheelFitsRunner(WHEELS[1], { platform: 'linux', arch: 'arm64', python: '3.14' }), false);
});

test('a stable-ABI wheel fits its own Python and later ones, never earlier ones', () => {
  const abi3 = (python) => `polars_text-0.7.3-${python}-abi3-win_amd64.whl`;
  assert.equal(wheelFitsRunner(abi3('cp39'), WINDOWS), true);
  assert.equal(wheelFitsRunner(abi3('cp314'), WINDOWS), true);
  assert.equal(wheelFitsRunner(abi3('cp315'), WINDOWS), false);
  // A build number and a wheel listing two Pythons are read by position.
  assert.equal(wheelFitsRunner('polars_text-0.7.3-1-cp312-abi3-win_amd64.whl', WINDOWS), true);
  assert.equal(wheelFitsRunner('polars_text-0.7.3-cp314.cp315-abi3-win_amd64.whl', WINDOWS), true);
  // Not a stable-ABI wheel: only its own Python, and not the free-threaded build.
  assert.equal(wheelFitsRunner('polars_text-0.7.3-cp315-cp315-win_amd64.whl', WINDOWS), false);
  assert.equal(wheelFitsRunner('polars_text-0.7.3-cp314-cp314t-win_amd64.whl', WINDOWS), false);
  // A package named like a tag is not mistaken for one.
  assert.equal(wheelFitsRunner('my-abi3-pkg-1.0-cp315-cp315-win_amd64.whl', WINDOWS), false);
  assert.equal(chooseSource(released({ wheels: [abi3('cp315')] }), WINDOWS).mode, 'source');
});

test('a submodule at its release tag uses the published wheel on every runner', () => {
  for (const runner of [LINUX, MAC, WINDOWS]) {
    assert.equal(chooseSource(released(), runner).mode, 'wheel');
  }
});

test('anything short of an exact release builds from source', () => {
  const cases = {
    'an unreleased commit': released({ gitlink: 'a'.repeat(40) }),
    'no release tag': released({ tagCommit: null }),
    'no version': released({ version: null }),
    'an unknown submodule commit': released({ gitlink: null }),
    'PyPI unreachable': released({ wheels: null }),
    'not on PyPI': released({ wheels: [] }),
    'no wheel for this runner': released({ wheels: [WHEELS[0]] }),
  };
  for (const [label, pkg] of Object.entries(cases)) {
    assert.equal(chooseSource(pkg, LINUX).mode, 'source', label);
  }
});

test('outputs skip the wheel packages in uv sync and need Rust only for source builds', () => {
  const wheel = chooseSource(released(), LINUX);
  const source = chooseSource(
    released({ name: 'polars-source-utils', version: '0.6.0', tagCommit: null }),
    LINUX,
  );
  assert.deepEqual(workflowOutputs([wheel, source]), {
    sync_args: '--no-install-package polars-text',
    wheels: 'polars-text==0.7.3',
    rust: 'true',
  });
  assert.deepEqual(workflowOutputs([wheel, { ...wheel, name: 'polars-source-utils', version: '0.6.0' }]), {
    sync_args: '--no-install-package polars-text --no-install-package polars-source-utils',
    wheels: 'polars-text==0.7.3 polars-source-utils==0.6.0',
    rust: 'false',
  });
  assert.deepEqual(workflowOutputs([source]), { sync_args: '', wheels: '', rust: 'true' });
});
