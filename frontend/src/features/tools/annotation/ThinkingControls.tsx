import type { components } from '@/api/generated/native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';

type Thinking = components['schemas']['Thinking'];
type Capabilities = components['schemas']['InferenceCapabilities'];
const labels: Record<Thinking['control'], string> = {
  reasoning_effort: 'Reasoning effort',
  thinking_budget: 'Thinking token budget',
  thinking_level: 'Thinking level',
  budget_tokens: 'Extended thinking token budget',
  adaptive_effort: 'Adaptive thinking effort',
  disabled: 'Disable thinking',
  openrouter_effort: 'OpenRouter reasoning effort',
};
function setting(control: Thinking['control'], value: string): Thinking {
  switch (control) {
    case 'disabled':
      return { control };
    case 'thinking_budget':
    case 'budget_tokens':
      return { control, value: Number(value) };
    case 'reasoning_effort':
      return { control, value };
    case 'thinking_level':
      return { control, value };
    case 'adaptive_effort':
      return { control, value };
    case 'openrouter_effort':
      return { control, value };
  }
}
export function ThinkingControls({
  value,
  legacy,
  capabilities,
  onChange,
}: {
  value: Thinking | null | undefined;
  legacy: boolean;
  capabilities?: Capabilities;
  onChange: (value: Thinking | null) => void;
}) {
  const budget = value?.control === 'thinking_budget' || value?.control === 'budget_tokens';
  return (
    <div className="min-w-40 flex-1 space-y-2">
      <label className="block space-y-1">
        Thinking
        <SearchableSelect
          ariaLabel="Thinking control"
          value={value?.control ?? ''}
          disabled={!capabilities}
          pinnedOptions={[{ value: '', label: 'Provider default' }]}
          options={(capabilities?.thinking ?? []).map((control) => ({
            value: control,
            label: labels[control],
          }))}
          onChange={(control) =>
            onChange(
              control
                ? setting(
                    control as Thinking['control'],
                    control === 'budget_tokens'
                      ? String(capabilities?.budget_min ?? 1024)
                      : control === 'thinking_budget'
                        ? '-1'
                        : (capabilities?.efforts[0] ?? ''),
                  )
                : null,
            )
          }
        />
      </label>
      {value &&
        value.control !== 'disabled' &&
        (budget ? (
          <label className="block space-y-1">
            {labels[value.control]}
            <Input
              aria-label={labels[value.control]}
              type="number"
              min={value.control === 'thinking_budget' ? -1 : capabilities?.budget_min}
              max={capabilities?.budget_max}
              value={value.value}
              onChange={(event) => onChange(setting(value.control, event.target.value))}
            />
            <span className="text-description text-label-secondary">
              {value.control === 'thinking_budget' ? '−1 uses dynamic thinking. ' : ''}
              Budget range: {capabilities?.budget_min}–{capabilities?.budget_max} tokens.
            </span>
          </label>
        ) : (
          <label className="block space-y-1">
            {labels[value.control]}
            <SearchableSelect
              ariaLabel={labels[value.control]}
              value={String(value.value)}
              options={(capabilities?.efforts ?? []).map((effort) => ({ value: effort }))}
              onChange={(effort) => onChange(setting(value.control, effort))}
            />
          </label>
        ))}
      {legacy && (
        <p role="status" className="text-description">
          This saved request uses the retired shared reasoning scale. Choose a native control before
          running again.
          <Button variant="link" onClick={() => onChange(null)}>
            Use provider defaults
          </Button>
        </p>
      )}
      {capabilities && capabilities.thinking.length === 0 && (
        <p className="text-description text-label-secondary">
          This model uses provider-default thinking.
        </p>
      )}
    </div>
  );
}
