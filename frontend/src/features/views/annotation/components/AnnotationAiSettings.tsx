import { Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AnnotationProviderConfigurationView } from '@/features/provider-credentials/providerCredentialsStore';
import { AdvancedSection } from '@/features/views/common/toolMode/AdvancedSection';
import { canListModels, providerConfigurationSecondaryText } from '../aiProviders';
import { AddAnnotationProviderDialog } from './AddAnnotationProviderDialog';
import { ModelNameCombobox } from './ModelNameCombobox';

interface AnnotationAiSettingsProps {
  configurations: AnnotationProviderConfigurationView[];
  selectedConfigurationId: string | null;
  onProviderChange: (configuration: AnnotationProviderConfigurationView, model: string) => void;
  onModelChange: (model: string) => void;
  onModelCommit: (configurationId: string, model: string) => void;
  providerModels: Record<string, string>;
  model: string;
  disabled?: boolean;
  /** The Example Data Block and its sampling: advanced, listed first. */
  children?: ReactNode;
  /** The prompt, inference and Run settings: advanced. */
  advanced?: ReactNode;
}

/**
 * Named provider-configuration and model selection for Annotation requests,
 * then the advanced settings, shown only while the tool's Advanced switch is
 * on. Provider and Model always show: they decide where text is sent.
 */
export function AnnotationAiSettings({
  configurations,
  selectedConfigurationId,
  onProviderChange,
  onModelChange,
  onModelCommit,
  providerModels,
  model,
  disabled,
  children,
  advanced,
}: AnnotationAiSettingsProps) {
  const [providerOpen, setProviderOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const selected =
    configurations.find((configuration) => configuration.id === selectedConfigurationId) ?? null;
  const selectedModel = selected ? model : '';
  const selectedNeedsKey = Boolean(selected && !canListModels(selected));

  return (
    <div className="flex flex-col gap-4">
      {/* Provider and Model are required, so they stay in view (issue 205). */}
      <div
        data-guidance="annotation-ai-provider-model"
        className="grid grid-cols-2 items-end gap-3"
        data-testid="annotation-ai-provider-model-controls"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="annotation-ai-provider">Provider</Label>
          <Popover open={providerOpen} onOpenChange={setProviderOpen}>
            <PopoverTrigger asChild>
              <Button
                id="annotation-ai-provider"
                type="button"
                variant="outline"
                disabled={disabled}
                className="h-10 w-full justify-start px-3 text-left"
              >
                {selected ? (
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium">{selected.name}</span>
                    <span className="truncate text-label-secondary text-description">
                      {selectedNeedsKey
                        ? 'Needs API key'
                        : providerConfigurationSecondaryText(selected)}
                    </span>
                  </span>
                ) : (
                  <span className="text-description">Select a provider</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
              <div className="flex flex-col gap-1">
                {configurations.length === 0 ? (
                  <p className="px-2 py-2 text-body text-description">No providers configured</p>
                ) : (
                  configurations.map((configuration) => (
                    <button
                      key={configuration.id}
                      type="button"
                      disabled={!canListModels(configuration)}
                      className="flex min-w-0 items-baseline gap-2 rounded-sm px-2 py-2 text-left hover:bg-list-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-inherit"
                      onClick={() => {
                        onProviderChange(configuration, providerModels[configuration.id] ?? '');
                        setProviderOpen(false);
                      }}
                    >
                      <span className="truncate text-body font-medium">{configuration.name}</span>
                      <span className="truncate text-label-secondary text-description">
                        {canListModels(configuration)
                          ? providerConfigurationSecondaryText(configuration)
                          : 'Needs API key'}
                      </span>
                    </button>
                  ))
                )}
                <div className="mt-1 border-t pt-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-body font-medium hover:bg-list-hover hover:text-foreground"
                    onClick={() => {
                      setProviderOpen(false);
                      setAddOpen(true);
                    }}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add provider
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {selected ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="annotation-ai-model">Model</Label>
            <ModelNameCombobox
              id="annotation-ai-model"
              configuration={selected}
              value={selectedModel}
              onChange={onModelChange}
              onCommit={(next) => {
                onModelCommit(selected.id, next);
              }}
              disabled={(disabled ?? false) || selectedNeedsKey}
            />
            {selectedNeedsKey ? (
              <p className="text-label-secondary text-error">
                Add an API key in Settings → Servers before listing models or running Annotation.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <AdvancedSection>
        {children}
        {advanced}
      </AdvancedSection>

      <AddAnnotationProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(configuration) => {
          if (canListModels(configuration)) {
            onProviderChange(configuration, providerModels[configuration.id] ?? '');
          }
        }}
      />
    </div>
  );
}
