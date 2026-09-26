import { DateDay, Field, TimestampMicrosecond } from 'apache-arrow';
import { describe, expect, it } from 'vitest';

import { buildFilterRequestPayload } from '../serializers';

describe('buildFilterRequestPayload (issue 187)', () => {
  // The picker emits the UTC instant of local midnight on the chosen day.
  const localMidnight = (year: number, month: number, day: number) =>
    new Date(year, month - 1, day).toISOString();

  it('sends the local calendar day for Date columns', () => {
    const field = new Field('published', new DateDay());
    const payload = buildFilterRequestPayload(
      [
        {
          id: 'a',
          column: 'published',
          operator: 'gte',
          value: localMidnight(2020, 6, 1),
          field,
        },
        {
          id: 'b',
          column: 'published',
          operator: 'between',
          value: { start: localMidnight(2020, 1, 1), end: '2020-12-31' },
          field,
        },
      ],
      'and',
    );

    expect(payload.conditions[0]?.value).toBe('2020-06-01');
    expect(payload.conditions[1]?.value).toEqual({ start: '2020-01-01', end: '2020-12-31' });
  });

  it('keeps full timestamps for datetime columns', () => {
    const iso = localMidnight(2020, 6, 1);
    const payload = buildFilterRequestPayload(
      [
        {
          id: 'a',
          column: 'updated',
          operator: 'gte',
          value: iso,
          field: new Field('updated', new TimestampMicrosecond()),
        },
      ],
      'and',
    );
    expect(payload.conditions[0]?.value).toBe(iso);
  });
});
