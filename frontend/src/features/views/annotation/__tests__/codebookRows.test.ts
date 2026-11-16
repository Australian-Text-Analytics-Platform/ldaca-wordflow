import { describe, expect, it } from 'vitest';

import {
  type CodebookRow,
  moveCodebookRow,
  splitCodebookRows,
  withCodebookRows,
} from '../taskContext';

const code = (name: string, outsideScale = false): CodebookRow =>
  outsideScale ? { class: name, description: '', outsideScale } : { class: name, description: '' };
const names = (rows: CodebookRow[]) =>
  rows.map((row) => `${row.class}${row.outsideScale ? ' (outside)' : ''}`);

describe('moveCodebookRow (dragging codes into order)', () => {
  it('moves a code up or down', () => {
    const rows = [code('A'), code('B'), code('C')];
    expect(names(moveCodebookRow(rows, 0, 2, false))).toEqual(['B', 'C', 'A']);
    expect(names(moveCodebookRow(rows, 2, 0, false))).toEqual(['C', 'A', 'B']);
  });

  it('leaves the rows alone when nothing moves', () => {
    const rows = [code('A'), code('B')];
    expect(moveCodebookRow(rows, 1, 1, true)).toBe(rows);
    expect(moveCodebookRow(rows, 0, 5, true)).toBe(rows);
  });

  it('on a scale, a code joins the group it is dropped in, so levels stay first', () => {
    const rows = [code('Low'), code('Mid'), code('High'), code('Not applicable', true)];
    expect(names(moveCodebookRow(rows, 0, 3, true))).toEqual([
      'Mid',
      'High',
      'Not applicable (outside)',
      'Low (outside)',
    ]);
    expect(names(moveCodebookRow(rows, 3, 1, true))).toEqual([
      'Low',
      'Not applicable',
      'Mid',
      'High',
    ]);
    expect(names(moveCodebookRow(rows, 2, 0, true))).toEqual([
      'High',
      'Low',
      'Mid',
      'Not applicable (outside)',
    ]);
  });

  it('ignores the groups for categories', () => {
    const rows = [code('A'), code('B', true)];
    expect(names(moveCodebookRow(rows, 0, 1, false))).toEqual(['B (outside)', 'A']);
  });
});

describe('codebook reserved rows', () => {
  it('reads codes below the scale row as outside it, and writes them back there', () => {
    const saved = [
      { class: 'Low', description: '' },
      { class: 'High', description: '' },
      { class: '__scale__', description: 'Ordered scale' },
      { class: 'Not applicable', description: '' },
      { class: '__task_context__', description: 'Emails.' },
    ];
    const split = splitCodebookRows(saved);
    expect(split).toMatchObject({
      scale: true,
      outsideScale: ['Not applicable'],
      taskContext: 'Emails.',
    });
    expect(split.codes.map((row) => row.class)).toEqual(['Low', 'High', 'Not applicable']);

    const written = withCodebookRows([code('Low'), code('High'), code('Not applicable', true)], {
      taskContext: 'Emails.',
      scale: true,
    });
    expect(written.map((row) => row.class)).toEqual(saved.map((row) => row.class));
    expect(written.every((row) => !('outsideScale' in row))).toBe(true);
  });

  it('without the scale row nothing is outside, and turning it off keeps every code', () => {
    expect(splitCodebookRows([{ class: 'A', description: '' }]).outsideScale).toEqual([]);
    expect(
      withCodebookRows([code('Low'), code('Not applicable', true)], {
        taskContext: '',
        scale: false,
      }).map((row) => row.class),
    ).toEqual(['Low', 'Not applicable']);
  });
});
