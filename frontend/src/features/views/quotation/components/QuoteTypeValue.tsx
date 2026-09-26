import { explainQuoteType } from '../quoteTypes';

/** The code, then its plain explanation on its own smaller line (issue 174). */
export function QuoteTypeValue({ code }: { code: string }) {
  const explanation = explainQuoteType(code);
  return (
    <span className="inline-flex flex-col align-top">
      <span>{code}</span>
      {explanation ? (
        <span className="text-label-secondary text-description">{explanation}</span>
      ) : null}
    </span>
  );
}
