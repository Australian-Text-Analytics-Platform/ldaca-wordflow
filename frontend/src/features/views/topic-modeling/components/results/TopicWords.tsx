import { Fragment } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TopicWordsProps {
  words: readonly string[];
  matched: ReadonlySet<string>;
}

/** A topic's words in their own order and size, with the Find topics matches picked out. */
function TopicWords({ words, matched }: TopicWordsProps) {
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={`${String(index)}-${word}`}>
          {index > 0 ? ', ' : null}
          {matched.has(word) ? (
            <strong className="font-semibold text-chart-4" data-matched-word="">
              {word}
            </strong>
          ) : (
            word
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * One truncated line of a topic's words; the tooltip shows all of them with
 * the same highlighting, since the line rarely has room for every word.
 */
export function TopicWordsLine(props: TopicWordsProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="truncate text-label-secondary text-description">
            <TopicWords {...props} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          <TopicWords {...props} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
