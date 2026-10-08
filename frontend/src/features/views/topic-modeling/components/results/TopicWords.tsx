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
 * One line of a topic's words that fades out at the right; the tooltip shows
 * all of them with the same highlighting, since the line rarely has room for
 * every word. No ellipsis: Safari shows its own plain tooltip for text cut
 * with one, which appeared beside this one (Chao, 2026-10-08).
 */
export function TopicWordsLine(props: TopicWordsProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="overflow-hidden whitespace-nowrap text-label-secondary text-description [mask-image:linear-gradient(to_right,#000_calc(100%_-_2rem),transparent)]">
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
