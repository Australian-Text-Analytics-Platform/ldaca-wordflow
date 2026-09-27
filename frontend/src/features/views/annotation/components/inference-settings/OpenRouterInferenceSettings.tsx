import { ReasoningField, TemperatureField } from './InferenceControlFields';

interface OpenRouterInferenceSettingsProps {
  temperature: number;
  onTemperatureCommit: (value: number) => void;
  reasoningEnabled: boolean;
  onReasoningEnabledChange: (enabled: boolean) => void;
  reasoningEffort: string;
  onReasoningEffortChange: (effort: string) => void;
  disabled?: boolean;
}

export function OpenRouterInferenceSettings({
  temperature,
  onTemperatureCommit,
  reasoningEnabled,
  onReasoningEnabledChange,
  reasoningEffort,
  onReasoningEffortChange,
  disabled,
}: OpenRouterInferenceSettingsProps) {
  return (
    <section aria-labelledby="openrouter-inference-settings" className="space-y-4">
      <div className="space-y-0.5">
        <h3 id="openrouter-inference-settings" className="text-body font-medium">
          OpenRouter parameters
        </h3>
        <p className="text-label-secondary text-description">
          OpenRouter forwards supported controls to the selected model and upstream provider.
        </p>
      </div>
      <TemperatureField
        temperature={temperature}
        onTemperatureCommit={onTemperatureCommit}
        description="Lower values give more consistent answers; higher values more varied ones. Not every model uses it."
        disabled={disabled}
      />
      <ReasoningField
        reasoningEnabled={reasoningEnabled}
        onReasoningEnabledChange={onReasoningEnabledChange}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={onReasoningEffortChange}
        label="Thinking"
        toggleLabel="Toggle thinking"
        effortLabel="Thinking effort"
        description="Let the model think step by step before it answers, where the model supports it. Slower, but often more accurate."
        disabled={disabled}
      />
    </section>
  );
}
