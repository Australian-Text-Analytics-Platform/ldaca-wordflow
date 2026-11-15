import type { ReactNode } from 'react';

import type { AnnotationProviderConfigurationView } from '@/features/provider-credentials/providerCredentialsStore';
import { AdvancedSection } from '@/features/views/common/toolMode/AdvancedSection';
import { AnnotationProviderModelPicker } from './AnnotationProviderModelPicker';

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
  return (
    <div className="flex flex-col gap-4">
      <AnnotationProviderModelPicker
        configurations={configurations}
        selectedConfigurationId={selectedConfigurationId}
        onProviderChange={onProviderChange}
        onModelChange={onModelChange}
        onModelCommit={onModelCommit}
        providerModels={providerModels}
        model={model}
        disabled={disabled}
        guidanceTarget="annotation-ai-provider-model"
      />

      <AdvancedSection>
        {children}
        {advanced}
      </AdvancedSection>
    </div>
  );
}
