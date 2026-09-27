import { GENERATED_COLUMN_EXPLANATIONS } from '../generatedColumns';

/**
 * A generated column's stored name, with a small grey plain explanation
 * beneath it (issue 205). Other columns show just their name.
 */
export function GeneratedColumnLabel({ name }: { name: string }) {
  const explanation = GENERATED_COLUMN_EXPLANATIONS[name];
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span>{name}</span>
      {explanation ? (
        // A visual aid; the accessible name stays the stored column name.
        <span
          aria-hidden="true"
          className="text-badge font-normal tracking-normal normal-case text-description/80"
        >
          {explanation}
        </span>
      ) : null}
    </span>
  );
}
