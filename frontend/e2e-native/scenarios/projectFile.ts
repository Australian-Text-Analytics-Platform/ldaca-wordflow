import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/** Read an exported project in a fresh production runtime, without reusing the exporting runtime. */
export async function inspectProjectFile(path: string, inspect: (base: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'wordflow-export-reader-'));
  const executable = resolve(
    import.meta.dirname,
    '../../../target/debug',
    process.platform === 'win32' ? 'wordflow-api-dev.exe' : 'wordflow-api-dev',
  );
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      RUST_LOG: 'info',
      WORDFLOW_BIND_ADDR: '127.0.0.1:0',
      WORDFLOW_CONFIG_DIR: directory,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const stopped = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => {
      resolve();
    });
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => {
        reject(new Error(`Export reader did not start: ${log}`));
      }, 30000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Export reader exited: ${String(code)} ${log}`));
      });
      child.stderr.on('data', (chunk: Buffer) => {
        log += chunk.toString();
        const address = /address=(127\.0\.0\.1:\d+)/.exec(log)?.[1];
        if (address) {
          clearTimeout(timer);
          resolve(`http://${address}`);
        }
      });
    });
    const response = await fetch(`${base}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) throw new Error(`Exported project could not open: ${await response.text()}`);
    await inspect(base);
  } finally {
    child.kill('SIGTERM');
    await stopped;
    await rm(directory, { recursive: true, force: true });
  }
}
