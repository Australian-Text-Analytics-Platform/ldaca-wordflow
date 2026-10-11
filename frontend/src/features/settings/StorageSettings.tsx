import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/isTauri';
const labels = {
  config: 'Configuration',
  data: 'Application data',
  local_data: 'Local data',
  cache: 'Cache',
  logs: 'Logs',
  temporary: 'Temporary files',
};
export function StorageSettings({ base }: { base: string }) {
  const locations = useQuery({
    queryKey: ['host', base, 'storage'],
    queryFn: async ({ signal }) =>
      isTauri()
        ? invoke<components['schemas']['StorageLocations']>('get_storage_locations')
        : (await request(base, '/api/storage/locations', 'get', { signal })).json(),
  });
  const [notice, setNotice] = useState('');
  return (
    <section className="space-y-4" aria-label="Storage locations">
      <h2 className="text-heading-3 font-semibold">Storage locations</h2>
      <p className="max-w-prose text-description text-body-secondary">
        {isTauri()
          ? 'Folders used by this desktop installation.'
          : locations.data?.location_scope === 'worker'
            ? 'Worker-side locations for your authenticated account.'
            : 'Server-side locations on the single-user web host.'}{' '}
        Locations are set when the host starts.
      </p>
      {locations.isPending && <p role="status">Loading locations…</p>}
      {locations.isError && (
        <div role="alert">
          Locations could not be loaded.{' '}
          <Button variant="outline" onClick={() => void locations.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <dl className="divide-y divide-surface-border">
        {locations.data?.directories.map((location) => (
          <div key={location.category} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <dt className="font-medium">{labels[location.category]}</dt>
              <dd className="mt-1 break-all text-description text-body-secondary">
                {location.path}
                {!location.exists && ' (not created yet)'}
              </dd>
            </div>
            <Button
              variant="outline"
              disabled={isTauri() && !location.exists}
              aria-label={`${isTauri() ? 'Open' : 'Copy'} ${labels[location.category]} ${isTauri() ? 'folder' : 'path'}`}
              onClick={() => {
                void (
                  isTauri()
                    ? invoke('open_storage_directory', { category: location.category })
                    : navigator.clipboard.writeText(location.path)
                )
                  .then(() => setNotice(isTauri() ? 'Folder opened.' : 'Path copied.'))
                  .catch(() => setNotice('The action could not finish. Retry.'));
              }}
            >
              {isTauri() ? 'Open folder' : 'Copy path'}
            </Button>
          </div>
        ))}
        {[
          ['Project library', locations.data?.project_library],
          ['Data file library', locations.data?.data_library],
        ].map(
          ([label, path]) =>
            path && (
              <div key={label} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <dt className="font-medium">{label}</dt>
                  <dd className="mt-1 break-all text-description text-body-secondary">{path}</dd>
                </div>
                <Button
                  variant="outline"
                  aria-label={`Copy ${label} path`}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(path)
                      .then(() => setNotice('Path copied.'))
                      .catch(() => setNotice('Path could not be copied. Retry.'))
                  }
                >
                  Copy path
                </Button>
              </div>
            ),
        )}
      </dl>
      <p role="status" className="text-description">
        {notice}
      </p>
    </section>
  );
}
