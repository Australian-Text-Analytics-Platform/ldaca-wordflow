import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GENERATED_COLUMN_DETAILS, GENERATED_COLUMN_EXPLANATIONS } from '../generatedColumns';

/**
 * A generated column's stored name, with a short grey label beneath it
 * (issue 205). The full explanation is in a tooltip on that label, so the
 * column stays narrow. Other columns show just their name.
 */
export function GeneratedColumnLabel({ name }: { name: string }) {
  const explanation = GENERATED_COLUMN_EXPLANATIONS[name];
  const detail = GENERATED_COLUMN_DETAILS[name];
  // A visual aid; the accessible name stays the stored column name.
  const label = explanation ? (
    <span
      aria-hidden="true"
      className="text-badge font-normal tracking-normal normal-case text-description/80"
    >
      {explanation}
    </span>
  ) : null;
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span>{name}</span>
      {label && detail ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{label}</TooltipTrigger>
            <TooltipContent side="bottom">{detail}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        label
      )}
    </span>
  );
}
