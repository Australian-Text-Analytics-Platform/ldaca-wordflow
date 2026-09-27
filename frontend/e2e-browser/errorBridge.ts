// Injected only by the browser/native E2E hosts; never part of ordinary builds.
import { useSessionErrors } from '../src/features/diagnostics/sessionErrors';
import { reportProjectError } from '../src/features/project/projectErrors';

declare global {
  interface Window {
    __wordflowDiagnostics?: {
      connect: (url: string) => Promise<void>;
      flush: () => Promise<void>;
      disconnect: () => void;
      report: (message: string) => void;
      prepareForNavigation: () => void;
    };
  }
}

// WebDriver can tear down fetches before DOM unload events. Cancel reads first
// so forced navigation has the same AbortError semantics as other read disposal.
// Accepted operations have no query signal and retain their existing lifetime.
const originalFetch = window.fetch.bind(window);
const navigation = new AbortController();
window.fetch = async (input, options) => {
  const signal = options?.signal ? AbortSignal.any([options.signal, navigation.signal]) : undefined;
  try { return await originalFetch(input, signal ? { ...options, signal } : options); }
  catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
};

let endpoint = sessionStorage.getItem('wordflow.e2e.errorSink');
const sent = new Set<string>();
const pending = new Set<Promise<void>>();
const failures: string[] = [];
function send() {
  if (!endpoint) return;
  for (const entry of useSessionErrors.getState().entries.toReversed()) {
    if (sent.has(entry.id)) continue;
    sent.add(entry.id);
    const request = fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(entry),
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error(`Error collector returned ${String(response.status)}`);
    }).catch((error: unknown) => {
      failures.push(String(error));
    }).finally(() => pending.delete(request));
    pending.add(request);
  }
}
async function flush() {
  send();
  await Promise.all(pending);
  if (failures.length) throw new Error(failures.join('\n'));
}
const unsubscribe = useSessionErrors.subscribe(send);
window.__wordflowDiagnostics = {
  prepareForNavigation() { navigation.abort(); },
  report(message) { reportProjectError(new Error(message), 'Diagnostics test'); },
  async connect(url) {
    endpoint = url;
    sessionStorage.setItem('wordflow.e2e.errorSink', url);
    await flush();
  },
  flush,
  disconnect() {
    endpoint = null;
    sessionStorage.removeItem('wordflow.e2e.errorSink');
  },
};
send();
import.meta.hot?.dispose(() => { unsubscribe(); window.fetch = originalFetch; });
