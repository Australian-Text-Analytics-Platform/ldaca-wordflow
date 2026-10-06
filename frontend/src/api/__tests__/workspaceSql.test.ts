import { describe, expect, it } from 'vitest';

import { sqlGlobPattern, sqlIdentifier, sqlOrder, sqlString } from '../workspaceSql';

describe('project SQL builders', () => {
  it('quotes identifiers and literals without accepting SQL structure', () => {
    expect(sqlIdentifier('column"name')).toBe('"column""name"');
    expect(sqlString("O'Brien")).toBe("'O''Brien'");
  });

  it('sorts empty values last in both directions (issue 317)', () => {
    expect(sqlOrder('score')).toBe('"score" ASC NULLS LAST');
    expect(sqlOrder('score', true)).toBe('"score" DESC NULLS LAST');
    expect(sqlOrder('name', false, 'text')).toBe(
      `CASE WHEN TRIM(CAST("name" AS VARCHAR)) = '' THEN NULL ELSE "name" END ASC NULLS LAST`,
    );
    expect(sqlOrder('ratio', true, 'float')).toBe(
      `CASE WHEN "ratio" = CAST('NaN' AS DOUBLE) THEN NULL ELSE "ratio" END DESC NULLS LAST`,
    );
  });

  it('preserves checklist substring, wildcard, and escaped-literal semantics', () => {
    expect(sqlGlobPattern('defence')).toBe('.*defence.*');
    expect(sqlGlobPattern('a*?')).toBe('^a.*.$');
    expect(sqlGlobPattern('topic\\*star')).toBe('.*topic\\*star.*');
  });
});
