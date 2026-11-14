import assert from 'node:assert/strict';
import test from 'node:test';

import { ciScope } from './ci-scope.mjs';

const push = (messages, files = ['backend/src/app.py']) =>
  ciScope({ event: 'push', ref: 'refs/heads/v0.7', messages, files });

test('an ordinary push to a development branch runs nothing', () => {
  assert.deepEqual(
    { ...push(['Trends: fix the legend']), reason: undefined },
    { run: false, backend: false, reason: undefined },
  );
});

test('a release commit anywhere in the push runs everything', () => {
  const scope = push(['Migration report: release 0.7.21', 'Release 0.7.21'], ['README.md']);
  assert.equal(scope.run, true);
  assert.equal(scope.backend, true);
});

test('a commit subject that only mentions a release does not count', () => {
  assert.equal(push(['Records for the 0.7.21 release']).run, false);
  assert.equal(push(['Release notes for 0.7.21 (draft)']).run, false);
});

test('[ci] runs CI, with the backend only when non-frontend files changed', () => {
  assert.deepEqual(
    { ...push(['Big refactor [ci]']), reason: undefined },
    { run: true, backend: true, reason: undefined },
  );
  const frontend = push(['Charts [ci]'], ['frontend/src/lib/chartExport.ts', 'pnpm-lock.yaml']);
  assert.equal(frontend.run, true);
  assert.equal(frontend.backend, false);
});

test('pushes to main and runs by hand check everything', () => {
  assert.equal(ciScope({ event: 'push', ref: 'refs/heads/main', files: ['README.md'] }).backend, true);
  assert.equal(ciScope({ event: 'workflow_dispatch' }).backend, true);
});

test('pull requests skip documentation-only changes and the backend for frontend changes', () => {
  const pr = (files, baseRef = 'v0.7') => ciScope({ event: 'pull_request', baseRef, files });
  assert.equal(pr(['docs/runbooks/x.md', 'frontend/public/tutorials/trends.md']).run, false);
  assert.deepEqual(
    { ...pr(['frontend/src/a.ts', 'docs/x.md']), reason: undefined },
    { run: true, backend: false, reason: undefined },
  );
  assert.equal(pr(['polars-text']).backend, true);
  assert.equal(pr(['.github/workflows/ci.yml']).backend, true);
  assert.equal(pr(['docs/x.md'], 'main').backend, true);
});

test('unknown changed files never skip the backend', () => {
  assert.equal(push(['[ci]'], null).backend, true);
  assert.equal(ciScope({ event: 'pull_request', baseRef: 'v0.7', files: null }).backend, true);
});
