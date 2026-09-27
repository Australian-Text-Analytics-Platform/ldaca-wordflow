import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { DataRootSetupForm } from '@/features/bootstrap/DataRootSetupForm';
import { useDataRoot } from '@/features/bootstrap/DataRootContext';

/** Uses the bootstrap control plane for the current single-user Data Root. */
export function DataFolderSettingsPanel() {
  const { resource, configureDataRoot } = useDataRoot();

  if (!resource.mutable) {
    return (
      <div className="space-y-2">
        <Badge variant="secondary">Set by the server</Badge>
        <p className="text-body text-description">
          {resource.source === 'environment'
            ? 'This server sets the data folder (DATA_ROOT), so it cannot be changed here.'
            : 'On a shared server, only the person who runs Wordflow can change the data folder.'}
        </p>
      </div>
    );
  }

  return (
    <DataRootSetupForm
      currentPath={resource.data_root}
      suggestedPath={resource.suggested_data_root}
      submitLabel="Switch data folder"
      onSubmit={async (path) => {
        await configureDataRoot(path);
        toast.success('Data folder changed.');
      }}
    />
  );
}
