import {
  Data,
  Field,
  Int64,
  RecordBatch,
  Schema,
  Struct,
  Table,
  TimestampNanosecond,
  Utf8,
  makeData,
  tableToIPC,
  vectorFromArray,
} from 'apache-arrow';
import { expect, it } from 'vitest';
import { decodeCellEditPage } from './decodeCellEditPage';

it('uses exact Arrow editing values and strips transport fields even for unusual names', () => {
  const fields = [
    new Field('big', new Int64()),
    new Field('stamp', new TimestampNanosecond()),
    new Field('__wordflow_edit_0', new Utf8()),
    new Field('reference', new Utf8()),
    new Field('big_edit', new Utf8()),
    new Field('stamp_edit', new Utf8()),
    new Field('text_edit', new Utf8()),
  ];
  const schema = new Schema(
    fields,
    new Map([
      [
        'wordflow:cell-edit',
        JSON.stringify({
          column_count: 3,
          row_ref: 3,
          values: { big: 4, stamp: 5, __wordflow_edit_0: 6 },
        }),
      ],
    ]),
  );
  const vectors = [
    vectorFromArray([9223372036854775807n, null], new Int64()),
    makeData({
      type: new TimestampNanosecond(),
      data: new BigInt64Array([1704164645123456789n, 1704164645123456789n]),
      length: 2,
    }),
    vectorFromArray(['original', ''], new Utf8()),
    vectorFromArray(['9007199254740993', '2'], new Utf8()),
    vectorFromArray(['9223372036854775807', null], new Utf8()),
    vectorFromArray(['2024-01-02 03:04:05.123456789', 'infinity'], new Utf8()),
    vectorFromArray(['original', ''], new Utf8()),
  ].map((vector) => (vector instanceof Data ? vector : vector.data[0]!));
  const batch = new RecordBatch(
    schema,
    makeData({ type: new Struct(fields), length: 2, children: vectors }),
  );
  const ipc = tableToIPC(new Table(batch), 'stream');
  const decoded = decodeCellEditPage(
    ipc.buffer.slice(ipc.byteOffset, ipc.byteOffset + ipc.byteLength) as ArrayBuffer,
    20,
  );
  expect(decoded.columns).toEqual(['big', 'stamp', '__wordflow_edit_0']);
  expect(decoded.rowRefs).toEqual(['9007199254740993', '2']);
  expect(decoded.editableValues[0]).toEqual({
    big: '9223372036854775807',
    stamp: '2024-01-02 03:04:05.123456789',
    __wordflow_edit_0: 'original',
  });
  expect(decoded.rows[1]).toEqual({ big: null, stamp: 'infinity', __wordflow_edit_0: '' });
  expect(decoded.schema[1]?.field.type.toString()).toBe(new TimestampNanosecond().toString());
  // Valid SQL column names must not inherit fake categorical choices from Object.prototype.
  expect(decoded.options.constructor).toBeUndefined();
  expect(decoded.options.toString).toBeUndefined();
});
