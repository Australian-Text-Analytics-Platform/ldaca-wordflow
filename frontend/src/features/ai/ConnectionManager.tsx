import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConnectionDialog } from './ConnectionDialog';
import * as aiApi from './api';
import { ConfirmAction } from '@/features/settings/ConfirmAction';
export function ConnectionManager({ base }: { base: string }) {
  const client = useQueryClient();
  const rows = useQuery({
    queryKey: ['host', base, 'ai-providers'],
    queryFn: ({ signal }) => aiApi.aiConnections(base, signal),
  });
  const [edit, setEdit] = useState<aiApi.AiConnection | 'new' | null>(null);
  const [remove, setRemove] = useState<aiApi.AiConnection | null>(null);
  return (
    <section className="space-y-4" aria-label="AI connections">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading-3 font-semibold">AI connections</h2>
        <Button onClick={() => setEdit('new')}>Add connection</Button>
      </div>
      <p className="max-w-prose text-description text-body-secondary">
        Manage connections here. Choose a connection and model in Annotation when setting up an AI
        run.
      </p>
      {rows.isPending && <p role="status">Loading connections…</p>}
      {rows.isError && (
        <div role="alert">
          <p>Connections could not be loaded.</p>
          <Button variant="outline" onClick={() => void rows.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {rows.data?.length === 0 && (
        <p className="py-6 text-body-secondary">
          No connections yet. Add one to use AI annotation.
        </p>
      )}
      <ul className="divide-y divide-surface-border">
        {rows.data?.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-semibold">{row.name}</h3>
              <p className="text-description text-body-secondary">
                {row.provider} ·{' '}
                {row.built_in
                  ? 'Built in'
                  : row.has_credential
                    ? row.credential_mode === 'browser'
                      ? 'Stored in this browser'
                      : row.credential_mode === 'session'
                        ? 'Session credential'
                        : 'OS credential store'
                    : 'No credential'}
              </p>
              {row.endpoint && (
                <p className="break-all text-description text-body-secondary">{row.endpoint}</p>
              )}
              {row.credential_error && (
                <p role="status" className="text-description">
                  {row.credential_error.message}
                </p>
              )}
            </div>
            {!row.built_in && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  aria-label={`Edit ${row.name}`}
                  onClick={() => setEdit(row)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => setRemove(row)}
                >
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {edit && (
        <ConnectionDialog
          key={edit === 'new' ? 'new' : edit.id}
          base={base}
          connection={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => setEdit(null)}
        />
      )}
      {remove && (
        <ConfirmAction
          title={`Delete ${remove.name}?`}
          description="This removes the connection and its credential. Saved AI runs keep their results; future runs using this connection need a replacement."
          action="Delete connection"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await aiApi.deleteAiConnection(base, remove.id);
            await client.invalidateQueries({ queryKey: ['host', base, 'ai-providers'] });
          }}
        />
      )}
    </section>
  );
}
