import { expect, it, vi } from 'vite-plus/test';
import { tableFromArrays } from 'apache-arrow';
import { previewDownload } from './previewDownload';
import type { AnnotationPreview } from './api';

it('exports only completed Preview rows with aligned predictions and preserves source values', () => {
  const table = tableFromArrays({
    text: ['first', 'second', 'blank'],
    id: BigInt64Array.from([9007199254740993n, 2n, 3n]),
    AI_prediction: ['original', 'value', 'kept'],
  });
  const preview = {
    table,
    predictions: [
      { status: 'success', label: 'A' },
      { status: 'failed', error: { code: 'provider_error', message: 'original diagnostic' } },
      null,
    ],
  } as AnnotationPreview;
  const output = previewDownload(preview);
  expect(output.table.numRows).toBe(3);
  expect(output.columns).toEqual([
    'AI_prediction_2',
    'AI_prediction_status',
    'AI_prediction_error',
  ]);
  expect(output.table.getChild('id')?.get(0)).toBe(9007199254740993n);
  expect(output.table.getChild('AI_prediction')?.get(0)).toBe('original');
  expect(output.table.getChild('AI_prediction_2')?.toArray()).toEqual(['A', null, null]);
  expect(output.table.getChild('AI_prediction_status')?.toArray()).toEqual([
    'success',
    'failed',
    'skipped',
  ]);
  expect(output.table.getChild('AI_prediction_error')?.get(1)).toBe('original diagnostic');
});

it('preserves missing, empty, blank and Unicode predictions without dynamic compilation', () => {
  const values = [null, '', ' ', '猫😀'];
  const preview = {
    table: tableFromArrays({ id: Int32Array.from([1, 2, 3, 4]) }),
    predictions: values.map((label) => ({ status: 'success', label })),
  } as AnnotationPreview;
  const blocked = () => {
    throw new EvalError('Dynamic compilation is blocked by desktop CSP');
  };
  vi.stubGlobal('Function', new Proxy(Function, { construct: blocked, apply: blocked }));
  try {
    const output = previewDownload(preview);
    expect(output.table.getChild('AI_prediction')?.toArray()).toEqual(values);
    expect(output.table.getChild('AI_prediction_error')?.toArray()).toEqual([
      null,
      null,
      null,
      null,
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
