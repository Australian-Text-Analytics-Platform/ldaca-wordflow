import { ReasoningField, TemperatureField } from './InferenceControlFields';

interface OpenAIInferenceSettingsProps {
  temperature: number;
  onTemperatureCommit: (value: number) => void;
  reasoningEnabled: boolean;
  onReasoningEnabledChange: (enabled: boolean) => void;
  reasoningEffort: string;
  onReasoningEffortChange: (effort: string) => void;
  disabled?: boolean;
}

export function OpenAIInferenceSettings({
  temperature,
  onTemperatureCommit,
  reasoningEnabled,
  onReasoningEnabledChange,
  reasoningEffort,
  onReasoningEffortChange,
  disabled,
}: OpenAIInferenceSettingsProps) {
  return (
    <section aria-labelledby="openai-inference-settings" className="space-y-4">
      <div className="space-y-0.5">
        <h3 id="openai-inference-settings" className="text-body font-medium">
          OpenAI parameters
        </h3>
        <p className="text-label-secondary text-description">
          Sampling and reasoning support depends on the selected OpenAI model.
        </p>
      </div>
      <TemperatureField
        temperature={temperature}
        onTemperatureCommit={onTemperatureCommit}
        description="Lower values give more consistent answers; higher values more varied ones. Not used while Thinking is on."
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
