import concurrently from 'concurrently';
import { pathToFileURL } from 'node:url';
import { applicationEnvironment, DEV_IDENTITY, TEST_IDENTITY } from './app-environment.mjs';

const frontendCommand = 'pnpm -C frontend dev';

function developmentPort(environment, name, fallback) {
  const value = environment[name] ?? fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65_535) {
    throw new Error(`${name} must be a port between 1 and 65535`);
  }
  return value;
}

export function parseDevMode(arguments_) {
  if (arguments_.length === 0) {
    return 'web';
  }
  if (arguments_.length === 1 && arguments_[0] === '--backend') {
    return 'backend';
  }
  if (arguments_.length === 1 && arguments_[0] === '--frontend') {
    return 'frontend';
  }
  throw new Error('Usage: vp run dev [--backend | --frontend]');
}

export function createDevCommands(mode, environment = process.env, apiOnly = false) {
  const frontendPort = developmentPort(environment, 'FRONTEND_PORT', '3000');
  const backendPort = developmentPort(environment, 'VITE_BACKEND_PORT', '8002');
  const frontend = {
    command: frontendCommand,
    env: {
      FRONTEND_PORT: frontendPort,
      VITE_BACKEND_PORT: backendPort,
      WORDFLOW_API_PREVIEW: apiOnly ? '1' : '0',
    },
    name: 'frontend',
    prefixColor: 'magenta',
  };
  if (mode === 'frontend') {
    return [frontend];
  }

  const identity = environment.WORDFLOW_APP_ID === TEST_IDENTITY ? TEST_IDENTITY : DEV_IDENTITY;
  const developmentCorsOrigins = [
    `http://localhost:${frontendPort}`,
    `http://127.0.0.1:${frontendPort}`,
  ];
  const backend = {
    command: apiOnly
      ? 'cargo run --locked --manifest-path backend/Cargo.toml --bin wordflow-api-dev -- --untitled'
      : 'cargo run --locked -p wordflow-server -- --mode single-user --public-base-path /',
    name: 'backend',
    prefixColor: 'blue',
    env: {
      ...applicationEnvironment(identity, { ...process.env, ...environment }),
      WORDFLOW_CONFIG_DIR: undefined,
      WORDFLOW_BIND_ADDR: `127.0.0.1:${backendPort}`,
      CORS_ALLOWED_ORIGINS:
        environment.CORS_ALLOWED_ORIGINS ??
        JSON.stringify(developmentCorsOrigins),
    },
  };
  if (mode === 'backend') {
    return [backend];
  }
  return [backend, frontend];
}

export async function runDev(arguments_ = process.argv.slice(2)) {
  const mode = parseDevMode(arguments_);
  const commands = createDevCommands(mode);
  if (mode !== 'frontend') {
    // Prepare embedded assets and compile Rust before making the Vite UI available.
    for (const command of ['pnpm -C frontend build', 'cargo build --locked -p wordflow-server']) {
      await concurrently([{ command, name: 'prepare' }], { prefix: 'name' }).result;
    }
  }
  const { result } = concurrently(commands, {
    killOthersOn: ['success', 'failure'],
    prefix: 'name',
  });
  await result;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  try {
    await runDev();
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}
