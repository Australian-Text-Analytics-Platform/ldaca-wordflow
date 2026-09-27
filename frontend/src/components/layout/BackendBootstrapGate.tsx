import { type ReactNode, useEffect, useRef, useState } from 'react';

import { SendFeedbackButton } from '@/components/layout/SendFeedbackButton';
import BlockingScreen from '@/features/auth/components/BlockingScreen';
import { DataRootContext, type DataRootResource } from '@/features/bootstrap/DataRootContext';
import { DataRootSetupForm } from '@/features/bootstrap/DataRootSetupForm';
import { parseApiErrorResponse } from '@/lib/apiError';
import {
  type ResolvedBackendConnection,
  resolveBackendConnection,
} from '@/lib/backend/backendConnection';

const RETRY_DELAY_MS = 750;
const READY_REFRESH_MS = 5_000;
const BOOTSTRAP_REFRESH_MS = 2_000;

const reloadWordflow = () => {
  window.location.reload();
};

function isDataRootResource(value: unknown): value is DataRootResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'state' in value &&
    'source' in value &&
    'mutable' in value &&
    'runtime_generation' in value
  );
}

/** Keeps the HTTP control plane mounted while bootstrapping the complete Runtime. */
export function BackendBootstrapGate({
  children,
  reloadApplication = reloadWordflow,
}: {
  children: ReactNode;
  reloadApplication?: () => void;
}) {
  const [connection, setConnection] = useState<ResolvedBackendConnection | null>(null);
  const [resource, setResource] = useState<DataRootResource | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [initialRuntimeGeneration, setInitialRuntimeGeneration] = useState<number | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const resolved = await resolveBackendConnection();
        const liveResponse = await fetch(resolved.liveUrl, { cache: 'no-store' });
        if (!liveResponse.ok) {
          throw await parseApiErrorResponse(liveResponse, {
            fallbackMessage: `Liveness check returned HTTP ${String(liveResponse.status)}`,
            includeResponseText: false,
          });
        }
        const livePayload: unknown = await liveResponse.json();
        if (
          typeof livePayload !== 'object' ||
          livePayload === null ||
          !('status' in livePayload) ||
          livePayload.status !== 'live'
        ) {
          throw new Error('Liveness check returned an unexpected response');
        }

        const rootResponse = await fetch(resolved.dataRootUrl, { cache: 'no-store' });
        if (!rootResponse.ok) {
          throw await parseApiErrorResponse(rootResponse, {
            fallbackMessage: `Backend request failed (HTTP ${String(rootResponse.status)})`,
            includeResponseText: false,
          });
        }
        const nextResource: unknown = await rootResponse.json();
        if (!isDataRootResource(nextResource)) {
          throw new Error('Data Root status returned an unexpected response');
        }
        if (nextResource.state === 'ready') {
          const readyResponse = await fetch(resolved.readyUrl, { cache: 'no-store' });
          if (!readyResponse.ok) {
            throw await parseApiErrorResponse(readyResponse, {
              fallbackMessage: `Readiness check returned HTTP ${String(readyResponse.status)}`,
              includeResponseText: false,
            });
          }
        }
        if (cancelled) return;
        setConnection(resolved);
        setInitialRuntimeGeneration((generation) => generation ?? nextResource.runtime_generation);
        setResource(nextResource);
        setConnectionError(null);
        const refreshDelay =
          nextResource.state === 'initializing' || nextResource.state === 'reconfiguring'
            ? RETRY_DELAY_MS
            : nextResource.state === 'ready'
              ? READY_REFRESH_MS
              : BOOTSTRAP_REFRESH_MS;
        timeoutId = window.setTimeout(() => {
          void poll();
        }, refreshDelay);
      } catch (cause) {
        if (cancelled) return;
        setConnectionError(cause instanceof Error ? cause.message : 'Backend is unreachable');
        timeoutId = window.setTimeout(() => {
          void poll();
        }, RETRY_DELAY_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  const configureDataRoot = async (dataRoot: string): Promise<DataRootResource> => {
    if (!connection || !resource?.change_token) {
      throw new Error('Data Root changes are not permitted');
    }
    const response = await fetch(connection.dataRootUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Data-Root-Token': resource.change_token,
      },
      body: JSON.stringify({ data_root: dataRoot }),
    });
    if (!response.ok) {
      const failure = await parseApiErrorResponse(response, {
        fallbackMessage: `Backend request failed (HTTP ${String(response.status)})`,
        includeResponseText: false,
      });
      let message = failure.message;
      const preferRefreshedError =
        message.startsWith('Internal server error') ||
        message.startsWith(`Backend request failed (HTTP ${String(response.status)})`);
      const refreshed = await fetch(connection.dataRootUrl, { cache: 'no-store' });
      if (refreshed.ok) {
        const payload: unknown = await refreshed.json();
        if (isDataRootResource(payload)) {
          setInitialRuntimeGeneration((generation) => generation ?? payload.runtime_generation);
          setResource(payload);
          const resourceMessage =
            typeof payload.error?.message === 'string' ? payload.error.message.trim() : '';
          if (preferRefreshedError && resourceMessage) message = resourceMessage;
        }
      }
      if (message !== failure.message) failure.message = message;
      throw failure;
    }
    const payload: unknown = await response.json();
    if (!isDataRootResource(payload))
      throw new Error('Data Root update returned an unexpected response');
    setInitialRuntimeGeneration((generation) => generation ?? payload.runtime_generation);
    setResource(payload);
    return payload;
  };

  const runtimeGenerationChanged =
    resource !== null &&
    initialRuntimeGeneration !== null &&
    resource.runtime_generation !== initialRuntimeGeneration;

  useEffect(() => {
    if (!runtimeGenerationChanged || reloadRequested.current) return;
    reloadRequested.current = true;
    reloadApplication();
  }, [reloadApplication, runtimeGenerationChanged]);

  if (!connection || !resource) {
    return (
      <BlockingScreen
        title="Can't connect to Wordflow"
        description="Wordflow cannot connect to its server. It will keep trying."
        status="Trying to connect…"
        error={connectionError}
        hint="In the desktop app, try closing and opening Wordflow again. On a shared server, ask the person who runs it."
        actions={<SendFeedbackButton variant="default" />}
      />
    );
  }

  if (runtimeGenerationChanged) {
    return (
      <BlockingScreen
        title="Reloading Wordflow"
        description="The data folder changed. Wordflow is reconnecting."
        status="Reloading…"
      />
    );
  }

  if (resource.state === 'initializing' || resource.state === 'reconfiguring') {
    return (
      <BlockingScreen
        title={
          resource.state === 'initializing' ? 'Opening your data folder' : 'Switching data folder'
        }
        description="Wordflow is getting your Projects and files ready."
        status={
          resource.state === 'initializing'
            ? 'Opening…'
            : 'Closing the old folder and opening the new one…'
        }
      />
    );
  }

  if (resource.state === 'stopping') {
    return (
      <BlockingScreen
        title="Wordflow is shutting down"
        description="Wordflow is closing your data folder."
        status="Stopping…"
        hint="Wordflow will reconnect if it starts again."
        actions={<SendFeedbackButton variant="default" />}
      />
    );
  }

  if (resource.state !== 'ready') {
    if (resource.mutable) {
      return (
        <BlockingScreen
          title={
            resource.state === 'configuration_error'
              ? 'Choose another data folder'
              : 'Set up Wordflow'
          }
          description="Choose the folder where Wordflow keeps your Projects, imported files, and settings."
          status="A data folder is needed"
          error={resource.error?.message ?? null}
          actions={
            <DataRootSetupForm
              currentPath={resource.data_root}
              suggestedPath={resource.suggested_data_root}
              onSubmit={async (path) => {
                await configureDataRoot(path);
              }}
            />
          }
        />
      );
    }
    return (
      <BlockingScreen
        title="Wordflow can't open its data folder"
        description="On this server, the data folder is set by the person who runs Wordflow."
        status="Not available"
        error={resource.error?.message ?? null}
        hint="Ask them to check the data folder setting (DATA_ROOT) and restart Wordflow."
        actions={<SendFeedbackButton variant="default" />}
      />
    );
  }

  const contextValue = { resource, configureDataRoot };
  return <DataRootContext.Provider value={contextValue}>{children}</DataRootContext.Provider>;
}
