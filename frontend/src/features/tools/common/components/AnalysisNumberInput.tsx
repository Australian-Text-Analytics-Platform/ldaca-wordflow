import { useState, type ComponentProps } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

export function AnalysisNumberInput({
  value,
  min,
  max,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (draft === null) return;
        const number = Number(draft);
        if (draft.trim() && Number.isInteger(number) && number >= min && number <= max)
          onCommit(number);
        else toast.info(`Enter a whole number between ${String(min)} and ${String(max)}.`);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
