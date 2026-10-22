/** The matched form with its Dispersion legend colour. */
export function ConcordanceMatchedForm({ form, color }: { form: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-0.5 w-3 rounded-full"
        style={{ background: color }}
      />
      {form}
    </span>
  );
}
