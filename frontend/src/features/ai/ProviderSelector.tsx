import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import * as aiApi from '@/features/ai/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHostServices } from '@/features/settings/HostSettings';

export function ProviderSelector({
  base,
  provider,
  model,
  onChange,
  disabled = false,
}: {
  base: string;
  provider: string;
  model: string;
  onChange: (provider: string, model: string) => void;
  disabled?: boolean;
}) {
  const fallbackClient = useQueryClient();
  const host = useHostServices();
  base = host?.base ?? base;
  const queryClient = host?.client ?? fallbackClient;
  const connections = useQuery(
    {
      queryKey: ['host', base, 'ai-providers'],
      queryFn: ({ signal }) => aiApi.aiConnections(base, signal),
    },
    queryClient,
  );
  const chosen = connections.data?.find((c) => c.id === provider);
  const models = useQuery(
    {
      queryKey: ['host', base, 'ai-models', provider, chosen?.revision],
      queryFn: ({ signal }) => aiApi.aiModels(base, provider, signal),
      enabled: Boolean(
        chosen &&
        (chosen.has_credential || chosen.provider === 'custom' || chosen.provider === 'apple'),
      ),
      staleTime: Infinity,
      retry: false,
    },
    queryClient,
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 space-y-1">
          Connection
          <SearchableSelect
            ariaLabel="AI connection"
            disabled={disabled}
            value={provider}
            options={(connections.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            onChange={(id) => {
              onChange(
                id,
                connections.data?.find((c) => c.id === id)?.provider === 'apple' ? 'system' : model,
              );
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={disabled || !host}
          onClick={(event) => host?.openSettings('ai', event.currentTarget)}
        >
          Manage connections
        </Button>
      </div>
      {chosen?.credential_error && (
        <p className="text-description text-label-secondary">{chosen.credential_error.message}</p>
      )}
      {provider && !chosen && connections.isSuccess && (
        <p role="status">This saved connection is unavailable. Choose a replacement.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 space-y-1">
          Model
          <SearchableSelect
            ariaLabel="Discovered AI model"
            disabled={disabled || models.isFetching}
            value={model}
            options={(models.data ?? []).map((value) => ({ value }))}
            onChange={(value) => {
              onChange(provider, value);
            }}
            placeholder={models.isFetching ? 'Discovering models…' : 'Search models'}
          />
        </label>
        <label className="min-w-48 flex-1 space-y-1">
          Model name
          <Input
            aria-label="AI model name"
            disabled={disabled || chosen?.built_in}
            value={model}
            onChange={(e) => {
              onChange(provider, e.target.value);
            }}
            placeholder="Or enter a model identifier"
          />
        </label>
        <Button
          variant="ghost"
          disabled={disabled || !chosen || models.isFetching}
          onClick={() => {
            void models.refetch();
          }}
        >
          Refresh models
        </Button>
      </div>
      {models.isError && (
        <p className="text-description text-label-secondary">
          Model discovery failed. Enter a model name or retry.
        </p>
      )}
    </div>
  );
}
