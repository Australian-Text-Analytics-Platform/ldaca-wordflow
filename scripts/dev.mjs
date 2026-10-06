import concurrently from 'concurrently';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const frontendCommand = 'pnpm -C frontend dev';

/** How many ports above the default `pnpm dev` tries for each half. */
const PORT_SEARCH_SIZE = 20;
const PORTS = [
  { name: 'VITE_BACKEND_PORT', fallback: '8001', half: 'backend' },
  { name: 'FRONTEND_PORT', fallback: '3000', half: 'frontend' },
];

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
  throw new Error('Usage: pnpm dev [--backend | --frontend]');
}

/** Whether a TCP port can be bound on this machine (IPv4 and IPv6 loopback). */
function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      // No IPv6 on this machine is not a conflict.
      resolve(error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL');
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host, exclusive: true });
  });
}

/** Whether something already answers on a local port. */
function answers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/**
 * A port is free when nothing answers on it and it can be bound. Both checks
 * are needed: on macOS a bind to 127.0.0.1 succeeds beside a server listening
 * on all interfaces (Vite's 0.0.0.0), which only the connection test catches.
 */
async function portIsFree(port) {
  if ((await answers(port, '127.0.0.1')) || (await answers(port, '::1'))) return false;
  return (await canListen(port, '127.0.0.1')) && (await canListen(port, '::'));
}

/**
 * Chooses the development ports before anything starts.
 *
 * `pnpm dev` starts both halves, so it can move either to the next free port
 * and tell both: the frontend learns the backend port, and the backend allows
 * the frontend's actual origin. A port you set yourself, or a half started on
 * its own (`--backend`, `--frontend`), keeps its port, because the other half
 * could not follow a move; a busy port then stops with a plain message
 * instead of uvicorn's "Address already in use" or Vite drifting to a port the
 * backend refuses.
 *
 * Returns the chosen ports as environment values plus notes to print.
 */
export async function resolveDevPorts(mode, environment = process.env, isFree = portIsFree) {
  const chosen = {};
  const notes = [];
  for (const { name, fallback, half } of PORTS) {
    const explicit = environment[name] !== undefined;
    const start = Number(developmentPort(environment, name, fallback));
    const used = mode === 'web' || mode === half;
    if (!used) {
      chosen[name] = String(start);
      continue;
    }
    if (explicit || mode !== 'web') {
      if (!(await isFree(start))) {
        throw new Error(
          `The ${half} port ${String(start)} is already in use. Stop the program using it, ` +
            `or choose another port with ${name}=<port>` +
            (mode === 'web' ? '.' : ` (and start the other half with the same ${name}).`),
        );
      }
      chosen[name] = String(start);
      continue;
    }
    let port = start;
    while (port < start + PORT_SEARCH_SIZE && !(await isFree(port))) port += 1;
    if (port >= start + PORT_SEARCH_SIZE) {
      throw new Error(
        `No free ${half} port between ${String(start)} and ${String(start + PORT_SEARCH_SIZE - 1)}. ` +
          `Choose one with ${name}=<port>.`,
      );
    }
    if (port !== start) notes.push(`${half}: port ${String(start)} is in use, using ${String(port)}.`);
    chosen[name] = String(port);
  }
  return { ports: chosen, notes };
}

export function createDevCommands(mode, environment = process.env) {
  const frontendPort = developmentPort(environment, 'FRONTEND_PORT', '3000');
  const backendPort = developmentPort(environment, 'VITE_BACKEND_PORT', '8001');
  const developmentCorsOrigins = [
    `http://localhost:${frontendPort}`,
    `http://127.0.0.1:${frontendPort}`,
  ];
  const backend = {
    command:
      'uv run --project backend uvicorn ldaca_wordflow.asgi:app ' +
      `--reload --port ${backendPort}`,
    name: 'backend',
    prefixColor: 'blue',
    env: {
      CORS_ALLOWED_ORIGINS:
        environment.CORS_ALLOWED_ORIGINS ??
        JSON.stringify(developmentCorsOrigins),
    },
  };
  const frontend = {
    command: frontendCommand,
    name: 'frontend',
    prefixColor: 'magenta',
    // Vite serves on exactly this port and calls the backend on its port.
    env: { FRONTEND_PORT: frontendPort, VITE_BACKEND_PORT: backendPort },
  };

  if (mode === 'backend') {
    return [backend];
  }
  if (mode === 'frontend') {
    return [frontend];
  }
  return [backend, frontend];
}

export async function runDev(arguments_ = process.argv.slice(2)) {
  const mode = parseDevMode(arguments_);
  const { ports, notes } = await resolveDevPorts(mode);
  for (const note of notes) console.log(note);
  const { result } = concurrently(createDevCommands(mode, { ...process.env, ...ports }), {
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
