import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  createDevCommands,
  parseDevMode,
} from './dev.mjs';

test('the default development mode starts the full single-user server and frontend', () => {
  const commands = createDevCommands('web', {});

  assert.deepEqual(
    commands.map(({ name }) => name),
    ['backend', 'frontend'],
  );
  assert.equal(
    commands[0].env.CORS_ALLOWED_ORIGINS,
    '["http://localhost:3000","http://127.0.0.1:3000"]',
  );
  assert.equal(Object.hasOwn(commands[0].env, 'DATA_ROOT'), false);
  assert.match(commands[0].command, /-p wordflow-server -- --mode single-user/);
  assert.equal(commands[0].env.WORDFLOW_APP_ID, 'au.edu.ldaca.wordflow.dev');
  assert.equal(commands[1].env.WORDFLOW_API_PREVIEW, '0');
});

test('engine tests explicitly select the API-only host and preview interface', () => {
  const commands = createDevCommands('web', { WORDFLOW_APP_ID: 'au.edu.ldaca.wordflow.test' }, true);
  assert.match(commands[0].command, /--bin wordflow-api-dev -- --untitled$/);
  assert.equal(commands[0].env.WORDFLOW_APP_ID, 'au.edu.ldaca.wordflow.test');
  assert.equal(commands[1].env.WORDFLOW_API_PREVIEW, '1');
});

test('backend development preserves an explicit CORS configuration', () => {
  const commands = createDevCommands('web', {
    CORS_ALLOWED_ORIGINS: '["http://example.test:3000"]',
  });

  assert.equal(commands.length, 2);
  assert.equal(commands[0].name, 'backend');
  assert.equal(
    commands[0].env.CORS_ALLOWED_ORIGINS,
    '["http://example.test:3000"]',
  );
});

test('frontend development can run without a Rust toolchain', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { createDevCommands } from ${JSON.stringify(new URL('./dev.mjs', import.meta.url).href)};
    console.log(JSON.stringify(createDevCommands('frontend', {})));
  `], { env: { ...process.env, PATH: '' }, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout).map(({ name }) => name),
    ['frontend'],
  );
});

test('development ports configure both processes and the CORS default', () => {
  const commands = createDevCommands('web', {
    FRONTEND_PORT: '3100',
    VITE_BACKEND_PORT: '8101',
  });

  assert.match(commands[0].command, /^cargo run --locked/);
  assert.equal(commands[0].env.WORDFLOW_BIND_ADDR, '127.0.0.1:8101');
  assert.equal(commands[1].env.VITE_BACKEND_PORT, '8101');
  assert.equal(commands[1].command, 'pnpm -C frontend dev');
  assert.equal(
    commands[0].env.CORS_ALLOWED_ORIGINS,
    '["http://localhost:3100","http://127.0.0.1:3100"]',
  );
  assert.throws(
    () => createDevCommands('web', { FRONTEND_PORT: 'not-a-port' }),
    /FRONTEND_PORT/,
  );
});

test('development mode arguments reject unsupported combinations', () => {
  assert.equal(parseDevMode([]), 'web');
  assert.equal(parseDevMode(['--backend']), 'backend');
  assert.equal(parseDevMode(['--frontend']), 'frontend');
  assert.throws(() => parseDevMode(['--backend', '--frontend']), /Usage/);
});

test('retired Python mode is unavailable', () => {
  assert.throws(() => parseDevMode(['--python']), /Usage/);
});

// Isolated test hosts must not write provider metadata into the developer's account.
test('backend receives an explicitly isolated host configuration directory', () => {
  const commands = createDevCommands('web', { WORDFLOW_APP_ID: 'au.edu.ldaca.wordflow.test', WORDFLOW_CONFIG_DIR: '/tmp/test-provider-settings' });
  assert.equal(commands[0].env.WORDFLOW_CONFIG_DIR, undefined);
  assert.ok(commands[0].env.WORDFLOW_STORAGE_PATHS.includes('au.edu.ldaca.wordflow.test'));
  assert.equal(Object.hasOwn(commands[1].env, 'WORDFLOW_CONFIG_DIR'), false);
});

test('interactive and test hosts receive isolated model cache environments', () => {
  const dev = createDevCommands('backend', { HF_HOME: '/production/models', WORDFLOW_QUOTATION_MODEL: '/production/model', WORDFLOW_CONFIG_DIR: '/production/settings' })[0].env;
  const isolated = createDevCommands('backend', { WORDFLOW_APP_ID: 'au.edu.ldaca.wordflow.test' })[0].env;
  assert.ok(dev.WORDFLOW_STORAGE_PATHS.includes('au.edu.ldaca.wordflow.dev'));
  assert.equal(dev.HF_HOME, undefined);
  assert.ok(isolated.WORDFLOW_STORAGE_PATHS.includes('au.edu.ldaca.wordflow.test'));
  assert.equal(isolated.HF_HOME, undefined);
  assert.notEqual(dev.WORDFLOW_STORAGE_PATHS, isolated.WORDFLOW_STORAGE_PATHS);
  assert.equal(dev.WORDFLOW_QUOTATION_MODEL, undefined);
  assert.equal(dev.WORDFLOW_CONFIG_DIR, undefined);
  assert.equal(isolated.WORDFLOW_ICU_PATH, undefined);
});
