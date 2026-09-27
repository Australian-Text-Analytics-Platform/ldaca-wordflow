import type { components } from '@/api/generated/native';
import { request } from '../project/api';
import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { reportProjectError } from '../project/projectErrors';
import { invoke } from '@tauri-apps/api/core';
import { DesktopWindowFrame } from '@/components/layout/DesktopWindowFrame';
import ProjectApp from '../project/ProjectApp';
import wordflowIcon from '@/wordflow-icon.png';

type BackendStatus =
  | { status: 'starting' | 'stopping' | 'stopped' }
  | { status: 'ready'; url: string }
  | { status: 'failed'; error: components['schemas']['Error'] };

type DisplayStatus =
  | { status: 'starting' | 'stopping' | 'stopped' }
  | { status: 'ready'; url: string }
  | { status: 'failed'; error: string };

/** Discovers the project backend through native IPC or the browser's same-origin proxy. */
export default function DesktopApp({ backendUrl }: { backendUrl?: string }) {
  const [backend, setBackend] = useState<DisplayStatus>({ status: 'starting' });

  useEffect(() => {
    const controller = new AbortController();
    const cancelled = () => controller.signal.aborted;
    let stop: (() => void) | undefined;
    function apply(state: BackendStatus) {
      if (cancelled()) return;
      setBackend((previous) =>
        state.status === 'ready'
          ? state
          : previous.status === 'ready'
            ? previous
            : state.status === 'failed'
              ? { status: 'failed', error: state.error.message }
              : state,
      );
      if (state.status === 'failed')
        reportProjectError(state.error, 'Backend unavailable', 'backend-status');
    }
    const fail = (error: unknown) => {
      apply({
        status: 'failed',
        error: {
          code: 'connection_error',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    };
    if (backendUrl !== undefined) {
      // The standalone browser host has no native supervisor publishing readiness.
      void request(backendUrl, '/health/ready', 'get', {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          const health = await response.json();
          if (!response.ok || health.status !== 'ready')
            throw new Error('Wordflow could not verify backend readiness.');
          apply({ status: 'ready', url: backendUrl });
        })
        .catch(fail);
    } else {
      void getCurrentWindow()
        .listen<BackendStatus>('backend-status', ({ payload }) => {
          apply(payload);
        })
        .then(async (unlisten) => {
          if (cancelled()) {
            unlisten();
            return;
          }
          stop = unlisten;
          apply(await invoke<BackendStatus>('get_backend_status'));
        })
        .catch(fail);
    }
    return () => {
      controller.abort();
      stop?.();
    };
  }, [backendUrl]);
  if (backend.status === 'ready') return <ProjectApp base={backend.url} />;

  const title = {
    starting: 'Starting Wordflow…',
    failed: 'Wordflow could not connect',
    stopping: 'Closing Wordflow…',
    stopped: 'Wordflow has stopped',
  }[backend.status];

  return (
    <DesktopWindowFrame>
      <main className="flex h-full items-center justify-center p-8">
        <section className="w-full max-w-md rounded-lg border border-surface-border bg-surface p-8">
          <img src={wordflowIcon} alt="" className="mb-6 h-14 w-14" />
          <p className="text-description mb-2 text-body">Wordflow</p>
          <h1 className="mb-3 text-heading-1 font-semibold" role="status">
            {title}
          </h1>
          {backend.status === 'failed' && (
            <div role="alert" className="text-body">
              <p>{backend.error}</p>
              <p className="mt-3">
                Close and reopen Wordflow. If this continues, include this message when reporting
                the problem.
              </p>
            </div>
          )}
        </section>
      </main>
    </DesktopWindowFrame>
  );
}
