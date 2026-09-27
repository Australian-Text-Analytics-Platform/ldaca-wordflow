import { useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { quoteColors, type Quote } from './quotationRows';
const kinds = ['quote', 'speaker', 'verb'] as const;
/** All native offsets are Unicode characters, never JavaScript UTF-16 indices. */
export function QuotationText({
  text,
  quotes,
  context,
}: {
  text: string;
  quotes: Quote[];
  context?: number;
}) {
  const [emphasis, setEmphasis] = useState<number | null>(null);
  const chars = Array.from(text);
  const spans = quotes.flatMap((quote, quoteIndex) =>
    kinds.flatMap((kind) => {
      const start = quote[`${kind}_start_idx`],
        end = quote[`${kind}_end_idx`];
      return typeof start === 'number' &&
        typeof end === 'number' &&
        start >= 0 &&
        end > start &&
        end <= chars.length
        ? [{ start, end, kind, quoteIndex }]
        : [];
    }),
  );
  let left = 0,
    right = chars.length;
  if (context !== undefined && spans.length) {
    left = Math.min(...spans.map((s) => s.start));
    right = Math.max(...spans.map((s) => s.end));
    const before = chars.slice(0, left).join('');
    const after = chars.slice(right).join('');
    const words = [...before.matchAll(/\S+/gu)];
    const following = [...after.matchAll(/\S+/gu)];
    if (context > 0) {
      left = Array.from(
        before.slice(0, words[Math.max(0, words.length - context)]?.index ?? 0),
      ).length;
      const last = following[Math.min(context, following.length) - 1];
      right += last ? Array.from(after.slice(0, last.index + last[0].length)).length : 0;
    }
  }
  const bounds = [
    ...new Set([
      left,
      right,
      ...spans.flatMap((s) => [Math.max(left, s.start), Math.min(right, s.end)]),
    ]),
  ]
    .filter((n) => n >= left && n <= right)
    .sort((a, b) => a - b);
  return (
    <span>
      {left > 0 ? '… ' : ''}
      {bounds.slice(0, -1).map((start, index) => {
        const end = bounds[index + 1] ?? right;
        const covering = spans.filter((s) => s.start < end && s.end > start);
        const kind = covering[0]?.kind;
        return (
          <span
            key={start}
            title={
              covering.map((s) => `${s.kind} ${String(s.quoteIndex + 1)}`).join(', ') || undefined
            }
            tabIndex={covering.some((span) => span.start === start) ? 0 : undefined}
            onMouseEnter={() => {
              setEmphasis(covering[0]?.quoteIndex ?? null);
            }}
            onMouseLeave={() => {
              setEmphasis(null);
            }}
            onFocus={() => {
              setEmphasis(covering[0]?.quoteIndex ?? null);
            }}
            onBlur={() => {
              setEmphasis(null);
            }}
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
            style={
              kind
                ? {
                    textDecoration: 'underline',
                    textDecorationColor: quoteColors[kind],
                    textDecorationThickness: 2,
                    textUnderlineOffset: 3,
                    backgroundColor: covering.some((span) => span.quoteIndex === emphasis)
                      ? `color-mix(in srgb, ${quoteColors[kind] ?? 'currentColor'} 15%, transparent)`
                      : undefined,
                  }
                : undefined
            }
          >
            {covering
              .filter((span) => span.start === start)
              .map((span) => (
                <span key={`${String(span.quoteIndex)}-${span.kind}`} className="sr-only">
                  {span.kind.toUpperCase()}
                  {quotes.length > 1 ? ` ${String(span.quoteIndex + 1)}` : ''}
                </span>
              ))}
            {covering
              .filter(
                (span) =>
                  span.kind === 'quote' &&
                  span.start === start &&
                  quotes[span.quoteIndex]?.quote_type,
              )
              .map((span) => (
                <Tooltip key={span.quoteIndex}>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      aria-label={`Quotation ${String(span.quoteIndex + 1)} extraction pattern`}
                      className="mx-1 inline-flex align-baseline text-description"
                    >
                      <Info className="size-3" aria-hidden />
                      {quotes.length > 1 && <sup>{span.quoteIndex + 1}</sup>}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">
                    {String(quotes[span.quoteIndex]?.quote_type)}:{' '}
                    {quotationPatternDescription(String(quotes[span.quoteIndex]?.quote_type))}
                  </TooltipContent>
                </Tooltip>
              ))}
            {chars.slice(start, end).join('')}
          </span>
        );
      })}
      {right < chars.length ? ' …' : ''}
    </span>
  );
}

function quotationPatternDescription(pattern: string): string {
  if (/^[SVCQ]+$/.test(pattern))
    return `Order of extracted parts: ${Array.from(pattern, (code) => ({ S: 'speaker', V: 'reporting verb', C: 'quotation content', Q: 'quotation mark' })[code]).join(' → ')}.`;
  if (pattern === 'AccordingTo') return 'Attribution introduced by “according to”.';
  if (pattern === 'Heuristic') return 'Quotation detected by fallback quotation-mark rules.';
  return 'Extraction rule reported by the quotation engine.';
}
