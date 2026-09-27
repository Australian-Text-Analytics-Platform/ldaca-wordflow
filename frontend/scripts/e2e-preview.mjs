import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import concurrently from 'concurrently';
import { SevereServiceError } from 'webdriverio';
import { createDevCommands } from '../../scripts/dev.mjs';
import { assertGuiTestEnvironment } from './gui-test-environment.mjs';

/** WDIO launcher service owns the same Rust/Vite hosts used by pnpm dev. */
export default class PreviewHost {
  async onPrepare() {
    try {
      assertGuiTestEnvironment();
      for (const port of [3212, 8212]) {
        await new Promise((resolve, reject) => {
          const probe = createServer();
          probe.once('error', () =>
            reject(
              new Error(`Test port ${port} is unavailable. Refusing to reuse another project.`),
            ),
          );
          probe.listen(port, '127.0.0.1', () => probe.close(resolve));
        });
      }
      this.directory = await mkdtemp(join(tmpdir(), 'wordflow-wdio-'));
      process.env.WORDFLOW_E2E_TEMP_DIR = this.directory;
      process.env.WORDFLOW_E2E_ERRORS = '1';
      const commands = createDevCommands('web', {
        ...process.env,
        FRONTEND_PORT: '3212',
        VITE_BACKEND_PORT: '8212',
        WORDFLOW_CONFIG_DIR: join(this.directory, 'configuration'),
      });
      this.backendCommand = commands.find((command) => command.name === 'backend');
      this.options = {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        killOthersOn: ['success', 'failure'],
        prefix: 'name',
      };
      this.host = concurrently(
        commands.filter((command) => command.name === 'frontend'),
        this.options,
      );
      const exited = this.host.result.then(() => {
        throw new Error('Preview host stopped');
      });
      // Attach a handler immediately, including while readiness is being checked.
      const readiness = async () => {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          try {
            if ((await fetch('http://127.0.0.1:3212/')).ok) return;
          } catch {
            /* The hosts are still starting. */
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error('Vite did not become ready within 120 seconds');
      };
      await Promise.race([exited, readiness()]);
    } catch (error) {
      await this.onComplete();
      // Ordinary service errors are only logged by WDIO, which would run tests.
      throw new SevereServiceError(error instanceof Error ? error.message : String(error));
    }
  }
  async onWorkerStart() {
    // Each spec owns a fresh native runtime. A database failure must not poison later specs.
    // maxInstances=1 keeps the fixed Vite proxy port exclusive to the current worker.
    this.backend = concurrently([this.backendCommand], this.options);
    const exited = this.backend.result.then(() => {
      throw new Error('Native test runtime stopped');
    });
    const ready = async () => {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        try {
          if ((await fetch('http://127.0.0.1:8212/health/ready')).ok) return;
        } catch {
          /* Starting. */
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error('Native test runtime did not become ready');
    };
    try {
      await Promise.race([ready(), exited]);
    } catch (error) {
      await this.onWorkerEnd();
      throw new SevereServiceError(String(error));
    }
  }
  async onWorkerEnd() {
    this.backend?.commands.forEach((command) => command.kill());
    await this.backend?.result.catch(() => {});
    this.backend = undefined;
  }
  async onComplete() {
    await this.onWorkerEnd();
    this.host?.commands.forEach((command) => command.kill());
    await this.host?.result.catch(() => {});
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
