import { ProjectError, request } from '@/api/client';
import { setAccount } from '@/features/server/account';
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { installExternalFileDropGuard } from './lib/externalFileDropGuard';
import { withPreferences } from './features/preferences/startup';
import { serverBase } from './features/server/context';
import { isTauri } from './lib/isTauri';
import { listenForSessionErrors } from './features/diagnostics/sessionErrors';

// Silence the harmless "ResizeObserver loop completed with undelivered
// notifications" message before any module-level code (and Vite's HMR
// overlay) gets a chance to surface it. The browser raises this when a RO
// callback's work doesn't finish in one animation frame — the spec marks
// it benign and the next frame redelivers — but it still trips Vite's
// unhandled-error overlay during dev. ECharts + our own RO consumers in
// chart/sidebar/hint code legitimately hit it on rapid re-layout.
if (typeof window !== 'undefined') {
  installExternalFileDropGuard(window);

  /** Filters only the ResizeObserver loop warning that Vite should ignore. */
  /** Called by: the global error listener before React renders the router. */
  const isResizeObserverLoopMessage = (msg: unknown): boolean =>
    typeof msg === 'string' && msg.includes('ResizeObserver loop');
  window.addEventListener('error', (event) => {
    if (isResizeObserverLoopMessage(event.message)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
  const stopListening = listenForSessionErrors(window);
  import.meta.hot?.dispose(stopListening);
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

async function renderApplication(rootContainer: HTMLElement) {
  const server = isTauri() ? null : serverBase();
  if (server !== null) {
    const { default: ServerApp } = await import('./features/server/ServerApp');
    createRoot(rootContainer).render(
      <React.StrictMode>
        <ServerApp base={server} />
      </React.StrictMode>,
    );
    return;
  }
  const { default: DesktopApp } = await import('./features/desktop/DesktopApp');
  createRoot(rootContainer).render(
    <React.StrictMode>
      <DesktopApp backendUrl={isTauri() ? undefined : ''} />
    </React.StrictMode>,
  );
}

async function start() {
  const base = isTauri() ? null : serverBase();
  if (base !== null) {
    try {
      setAccount(await (await request(base, '/api/account', 'get', {})).json());
    } catch (error) {
      if (!(error instanceof ProjectError && error.code === 'authentication_required')) {
        createRoot(container!).render(
          <main className="p-6">
            <h1>Could not connect to Wordflow</h1>
            <p>{error instanceof Error ? error.message : String(error)}</p>
            <button
              onClick={() => {
                window.location.reload();
              }}
            >
              Retry
            </button>
          </main>,
        );
        return;
      }
      createRoot(container!).render(
        <main className="p-6">
          <h1>Sign in to Wordflow</h1>
          <a href={`${base}/api/auth/google/login`}>Sign in with Google</a>
          <br />
          <a href={`${base}/api/auth/cilogon/login`}>Sign in with CILogon</a>
        </main>,
      );
      return;
    }
    window.addEventListener('wordflow-account-expired', () => {
      window.location.reload();
    });
  }
  await withPreferences(container!, base ?? '', () => renderApplication(container!));
}
void start();
