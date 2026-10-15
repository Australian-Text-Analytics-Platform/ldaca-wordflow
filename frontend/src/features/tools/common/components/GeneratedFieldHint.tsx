import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const fields: Record<string, readonly [string, string]> = {
  left_context: ['Text before match', 'The requested context immediately before this match.'],
  matched_text: ['Matched text', 'The original source text that matched the search.'],
  right_context: ['Text after match', 'The requested context immediately after this match.'],
  start_idx: ['Match start', 'The zero-based Unicode character position where the match starts.'],
  end_idx: ['Match end', 'The exclusive Unicode character position where the match ends.'],
  l1: ['Left neighbour', 'The token immediately before the match.'],
  r1: ['Right neighbour', 'The token immediately after the match.'],
  l1_frequency: [
    'Left neighbour count',
    'The frequency of this left neighbour in the Concordance results.',
  ],
  r1_frequency: [
    'Right neighbour count',
    'The frequency of this right neighbour in the Concordance results.',
  ],
  extraction: [
    'Extracted text',
    'The generated extraction associated with this processed document.',
  ],
  speaker: [
    'Who is quoted',
    'The speaker identified by the quotation extractor; it may be missing.',
  ],
  quote: ['Quotation', 'The text identified as a quotation, retained from the original document.'],
  verb: ['Reporting verb', 'The reporting verb identified by the extractor, such as said.'],
  quote_type: [
    'Extraction pattern',
    'The rule or pattern that identified this quotation. Row Details explains recognised patterns.',
  ],
  quote_token_count: ['Quotation words', 'The extractor’s token count for this quotation.'],
  is_floating_quote: [
    'Continued quotation',
    'Whether this quotation continues a previous quotation and takes its speaker.',
  ],
  quote_row_idx: [
    'Quotation number',
    'The quotation’s zero-based position within this processed document.',
  ],
  prediction: [
    'AI suggestion',
    'The completed prediction for this Preview row. Preview does not write source labels.',
  ],
};
export function GeneratedFieldHint({ field }: { field: string }) {
  const position = /^(speaker|quote|verb)_(start|end)_idx$/.exec(field);
  const info =
    fields[field] ??
    (position
      ? [
          `${position[1]} ${position[2]}`,
          `The ${position[2] === 'start' ? 'zero-based start' : 'exclusive end'} Unicode character position of the ${position[1]} in the original document.`,
        ]
      : null);
  if (!info) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="block max-w-48 whitespace-normal break-words text-badge font-normal text-description"
        >
          {info[0]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{info[1]}</TooltipContent>
    </Tooltip>
  );
}
