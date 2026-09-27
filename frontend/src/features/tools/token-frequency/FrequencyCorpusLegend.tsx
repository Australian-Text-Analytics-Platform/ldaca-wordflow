import { GREY } from '../common/vizPalette';
import type { FrequencyAnalysisResult } from '@/features/project/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Corpus identity and colour use the saved run's Reference/Study order. */
export function FrequencyCorpusLegend({
  corpora,
  colors,
  gradient = false,
}: {
  corpora: FrequencyAnalysisResult['result']['payload']['corpora'];
  colors: string[];
  gradient?: boolean;
}) {
  return (
    <TooltipProvider>
      <div
        className="flex flex-wrap items-center gap-2 text-label-secondary"
        aria-label={gradient ? 'Reference to Study color scale' : 'Comparison corpora'}
      >
        {corpora.slice(0, 2).map((corpus, index) => (
          <div key={index} className="flex items-center gap-2">
            {gradient && index === 1 && (
              <span
                aria-hidden
                className="h-2.5 w-28 rounded-sm"
                style={{
                  background: `linear-gradient(to right, ${colors[0] ?? GREY}, ${colors[1] ?? GREY})`,
                }}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={`${index === 0 ? 'Reference' : 'Study'}: ${corpus.label}`}
                  className="inline-flex items-center gap-1.5 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span
                    aria-hidden
                    className="size-3 rounded-sm"
                    style={{ backgroundColor: colors[index] }}
                  />
                  {index === 0 ? 'Reference' : 'Study'}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 break-words">{corpus.label}</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
