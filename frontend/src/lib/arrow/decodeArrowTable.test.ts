import {
  DateDay,
  DateMillisecond,
  Decimal,
  Field,
  Int64,
  List,
  Struct,
  Table,
  vectorFromArray,
} from 'apache-arrow';
import { expect, it } from 'vitest';
import {
  arrowTypeDisplayName,
  arrowTypeName,
  decodeArrowData,
  normalizeArrowValue,
} from './decodeArrowTable';

it.each([new DateDay(), new DateMillisecond()])(
  'displays calendar dates without timezone shifts (%s)',
  (type) => {
    const table = new Table({
      date: vectorFromArray(
        [new Date('1969-12-31T00:00:00Z'), new Date('2024-02-29T00:00:00Z'), null],
        type,
      ),
    });
    expect(decodeArrowData(table).rows).toEqual([
      { date: '1969-12-31' },
      { date: '2024-02-29' },
      { date: null },
    ]);
    expect(arrowTypeDisplayName(new Field('date', type))).toBe('date');
    expect(arrowTypeName(new Field('date', type))).toBe(type.toString());
  },
);

it('normalizes dates recursively while retaining exact integers and decimals', () => {
  const field = new Field('when', new DateDay());
  const struct = new Struct([
    field,
    new Field('id', new Int64()),
    new Field('history', new List(field)),
  ]);
  expect(
    normalizeArrowValue({ when: 0, id: 9007199254740993n, history: [-86400000, null] }, struct),
  ).toEqual({ when: '1970-01-01', id: '9007199254740993', history: ['1969-12-31', null] });
  const decimal = new Decimal(3, 24);
  expect(arrowTypeDisplayName(new Field('value', decimal))).toBe('decimal (24, 3)');
  const exact = new Uint32Array([12345, 0, 0, 0]);
  exact.toString = () => '900719925474099312345';
  expect(normalizeArrowValue(exact, decimal)).toBe('900719925474099312.345');
});
