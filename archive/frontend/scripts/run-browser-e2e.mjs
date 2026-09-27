import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const dataRoot = await mkdtemp(join(tmpdir(), 'wordflow-playwright-'));
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const forwardedArguments = process.argv.slice(2);
if (forwardedArguments[0] === '--') forwardedArguments.shift();

const playwright = spawn(
  pnpmCommand,
  ['exec', 'playwright', 'test', ...forwardedArguments],
  {
    cwd: frontendDirectory,
    env: {
      ...process.env,
      WORDFLOW_E2E_DATA_ROOT: dataRoot,
    },
    stdio: 'inherit',
  },
);

const forwardSignal = (signal) => {
  if (!playwright.killed) {
    playwright.kill(signal);
  }
};
const handleSigint = () => {
  forwardSignal('SIGINT');
};
const handleSigterm = () => {
  forwardSignal('SIGTERM');
};

process.on('SIGINT', handleSigint);
process.on('SIGTERM', handleSigterm);

let exitCode = 1;
try {
  exitCode = await new Promise((resolve, reject) => {
    playwright.once('error', reject);
    playwright.once('exit', (code) => {
      resolve(code ?? 1);
    });
  });
} finally {
  process.off('SIGINT', handleSigint);
  process.off('SIGTERM', handleSigterm);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

process.exitCode = exitCode;
