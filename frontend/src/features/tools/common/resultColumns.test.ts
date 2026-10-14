import { expect, it } from 'vite-plus/test';
import { orderedResultColumns, resultColumnKey } from './resultColumns';

it('retains presentation order independently of sort, removes old fields and appends new ones', () => {
  const metadata = { column: 'quote', metadata: true };
  const generated = { column: 'quote', metadata: false };
  const added = { column: '新增', metadata: true };
  const order = [resultColumnKey(generated), 'removed', resultColumnKey(metadata)];
  expect(orderedResultColumns([metadata, generated, added], order)).toEqual([
    generated,
    metadata,
    added,
  ]);
  expect(order).toEqual([resultColumnKey(generated), 'removed', resultColumnKey(metadata)]);
});
