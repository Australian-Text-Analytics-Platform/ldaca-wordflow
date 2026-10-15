import { Table, Utf8, Utf8Builder } from 'apache-arrow';
import type { AnnotationPreview } from './api';

function strings(values: (string | null)[]) {
  // Arrow's nullValues option compiles a predicate, which desktop CSP forbids.
  const builder = new Utf8Builder({ type: new Utf8() });
  values.forEach((value, index) => {
    if (value === null) builder.setValid(index, false);
    else builder.set(index, value);
  });
  return builder.finish().toVector();
}

/** Append completed page predictions without invoking a provider or changing source labels. */
export function previewDownload(preview: AnnotationPreview) {
  const names = new Set(preview.table.schema.fields.map((field) => field.name.toLowerCase()));
  const unique = (stem: string) => {
    let name = stem;
    for (let suffix = 2; names.has(name.toLowerCase()); suffix++) name = `${stem}_${suffix}`;
    names.add(name.toLowerCase());
    return name;
  };
  const label = unique('AI_prediction');
  const status = unique('AI_prediction_status');
  const error = unique('AI_prediction_error');
  const predictions = new Table({
    [label]: strings(preview.predictions.map((p) => (p?.status === 'success' ? p.label : null))),
    [status]: strings(preview.predictions.map((p) => p?.status ?? 'skipped')),
    [error]: strings(
      preview.predictions.map((p) => (p?.status === 'failed' ? p.error.message : null)),
    ),
  });
  return { table: preview.table.assign(predictions), columns: [label, status, error] };
}
