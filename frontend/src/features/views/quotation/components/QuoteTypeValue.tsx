import HelpIcon from '@/components/help/HelpIcon';
import { explainQuoteType } from '../quoteTypes';

/** The code, then its plain explanation on its own smaller line (issue 174). */
export function QuoteTypeValue({ code }: { code: string }) {
  const explanation = explainQuoteType(code);
  return (
    <span className="inline-flex flex-col align-top">
      <span className="inline-flex items-center gap-1">
        {code}
        <HelpIcon
          targetKey="analysis.quotation.quote-types"
          label="About quote types"
          tooltip="What each quote type means, with an example sentence."
          className="h-5 w-5 shrink-0 text-description"
        />
      </span>
      {explanation ? (
        <span className="text-label-secondary text-description">{explanation}</span>
      ) : null}
    </span>
  );
}
