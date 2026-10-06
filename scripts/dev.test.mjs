import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDevCommands,
  parseDevMode,
  resolveDevPorts,
} from './dev.mjs';

test('the default development mode starts backend and frontend', () => {
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
});

test('backend development preserves an explicit CORS configuration', () => {
  const commands = createDevCommands('backend', {
    CORS_ALLOWED_ORIGINS: '["http://example.test:3000"]',
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, 'backend');
  assert.equal(
    commands[0].env.CORS_ALLOWED_ORIGINS,
    '["http://example.test:3000"]',
  );
});

test('frontend development can run independently', () => {
  assert.deepEqual(
    createDevCommands('frontend', {}).map(({ name }) => name),
    ['frontend'],
  );
});

test('development ports configure both processes and the CORS default', () => {
  const commands = createDevCommands('web', {
    FRONTEND_PORT: '3100',
    VITE_BACKEND_PORT: '8101',
  });

  assert.match(commands[0].command, /--port 8101$/);
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

const busy = (...ports) => async (port) => !ports.includes(port);

test('pnpm dev moves a busy default port and tells both halves', async () => {
  const { ports, notes } = await resolveDevPorts('web', {}, busy(8001, 8002, 3000));
  assert.deepEqual(ports, { VITE_BACKEND_PORT: '8003', FRONTEND_PORT: '3001' });
  assert.deepEqual(notes, [
    'backend: port 8001 is in use, using 8003.',
    'frontend: port 3000 is in use, using 3001.',
  ]);
  const [backend, frontend] = createDevCommands('web', ports);
  assert.match(backend.command, /--port 8003$/);
  assert.equal(
    backend.env.CORS_ALLOWED_ORIGINS,
    '["http://localhost:3001","http://127.0.0.1:3001"]',
  );
  assert.deepEqual(frontend.env, { FRONTEND_PORT: '3001', VITE_BACKEND_PORT: '8003' });
});

test('free default ports are used as they are', async () => {
  const { ports, notes } = await resolveDevPorts('web', {}, busy());
  assert.deepEqual(ports, { VITE_BACKEND_PORT: '8001', FRONTEND_PORT: '3000' });
  assert.deepEqual(notes, []);
});

test('a port you set, or one half on its own, never moves', async () => {
  await assert.rejects(
    resolveDevPorts('web', { VITE_BACKEND_PORT: '8001' }, busy(8001)),
    /backend port 8001 is already in use.*VITE_BACKEND_PORT/,
  );
  await assert.rejects(
    resolveDevPorts('backend', {}, busy(8001)),
    /backend port 8001 is already in use.*start the other half/,
  );
  // The half that is not started is not checked.
  const { ports } = await resolveDevPorts('backend', {}, busy(3000));
  assert.deepEqual(ports, { VITE_BACKEND_PORT: '8001', FRONTEND_PORT: '3000' });
});

test('pnpm dev gives up after the search range', async () => {
  const all = Array.from({ length: 20 }, (_, index) => 3000 + index);
  await assert.rejects(
    resolveDevPorts('web', {}, busy(...all)),
    /No free frontend port between 3000 and 3019/,
  );
});

