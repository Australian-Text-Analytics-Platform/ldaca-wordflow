import { Table, Utf8, vectorFromArray } from 'apache-arrow';
import type { AnnotationPreview } from './api';

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
    [label]: vectorFromArray(
      preview.predictions.map((p) => (p?.status === 'success' ? p.label : null)),
      new Utf8(),
    ),
    [status]: vectorFromArray(
      preview.predictions.map((p) => p?.status ?? 'skipped'),
      new Utf8(),
    ),
    [error]: vectorFromArray(
      preview.predictions.map((p) => (p?.status === 'failed' ? p.error.message : null)),
      new Utf8(),
    ),
  });
  return { table: preview.table.assign(predictions), columns: [label, status, error] };
}
