import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SessionError } from '../src/features/diagnostics/sessionErrors';

/** Runner-owned records survive document reloads, dismissed toasts and cleared history. */
export class ErrorCollector {
  private native: boolean;
  constructor(native = false) { this.native = native; }

  private isDriverSignal(entry: SessionError) {
    // The macOS embedded driver throws from an injected, document-root script
    // when WDIO resolves a stale element. WDIO already handles/retries this.
    // App frames (including the same error message) must still fail the test.
    return this.native && entry.source === 'window' && entry.message === 'stale element reference'
      && /^@tauri:\/\/localhost:\d+:\d+\nglobal code@tauri:\/\/localhost:\d+:\d+$/.test(entry.stack ?? '');
  }
  readonly records = new Map<string, SessionError>();
  private expected: { pattern: RegExp; count: number }[] = [];
  private path = `/${crypto.randomUUID()}`;
  private server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method !== 'POST' || request.url !== this.path) {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { body += chunk; });
    request.on('end', () => {
      try {
        const entry = JSON.parse(body) as SessionError;
        if (!entry.id || typeof entry.message !== 'string') throw new Error('Invalid error record');
        this.records.set(entry.id, entry);
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  });

  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${String((this.server.address() as AddressInfo).port)}${this.path}`;
  }

  reset() {
    this.records.clear();
    this.expected = [];
  }

  expect(pattern: RegExp, count = 1) {
    this.expected.push({ pattern, count });
  }

  assertExpected() {
    const remaining = [...this.records.values()].filter((entry) => !this.isDriverSignal(entry));
    const missing: string[] = [];
    for (const { pattern, count } of this.expected) {
      let matched = 0;
      for (let i = 0; i < remaining.length && matched < count;) {
        const entry = remaining[i];
        if (!entry) break;
        pattern.lastIndex = 0;
        if (pattern.test(`${entry.title}\n${entry.message}`)) {
          remaining.splice(i, 1);
          matched++;
        } else i++;
      }
      if (matched !== count) missing.push(`${String(pattern)}: expected ${String(count)}, received ${String(matched)}`);
    }
    if (remaining.length || missing.length) {
      throw new Error([
        ...remaining.map((entry) => `Unexpected ${entry.source} error: ${entry.title}\n${entry.message}`),
        ...missing,
      ].join('\n\n'));
    }
  }

  async close() {
    await new Promise<void>((resolve, reject) => this.server.close((error) => {
      if (error) reject(error);
      else resolve();
    }));
  }
}
