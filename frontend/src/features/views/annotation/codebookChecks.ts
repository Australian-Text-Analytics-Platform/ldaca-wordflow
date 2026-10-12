import type { AnnotationClassDescriptionRow } from '@/api';

/**
 * Repeated codes and shared descriptions in a Codebook (Chao, issue 389).
 *
 * Codes match ignoring capitals and spaces at the ends (the backend refuses
 * names that differ only in capitals); descriptions also ignore repeated
 * spaces. Rows without a code are left out.
 */
export interface CodebookCheck {
  /** Rows that repeat an earlier row's code and description. */
  repeatedRows: number[];
  /** Codes written with more than one description, with each description as first written. */
  codesWithSeveralDescriptions: { name: string; key: string; descriptions: string[] }[];
  /** Descriptions given to more than one code, with those codes. */
  sharedDescriptions: { codes: string[] }[];
  /** Every row any problem concerns, for marking in the Edit dialog. */
  rowsToMark: Set<number>;
}

export const codeKey = (code: string) => code.trim().toLocaleLowerCase();
const descriptionKey = (description: string) =>
  description.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function checkCodebook(rows: AnnotationClassDescriptionRow[]): CodebookCheck {
  const repeatedRows: number[] = [];
  const rowsToMark = new Set<number>();
  const seenRows = new Set<string>();
  const byCode = new Map<
    string,
    { name: string; descriptions: Map<string, string>; rows: number[] }
  >();
  const byDescription = new Map<string, { codes: Map<string, string>; rows: number[] }>();

  rows.forEach((row, index) => {
    const code = codeKey(row.class);
    if (!code) return;
    const description = descriptionKey(row.description);
    const rowKey = JSON.stringify([code, description]);
    if (seenRows.has(rowKey)) repeatedRows.push(index);
    seenRows.add(rowKey);

    const codeEntry = byCode.get(code) ?? {
      name: row.class.trim(),
      descriptions: new Map<string, string>(),
      rows: [],
    };
    if (!codeEntry.descriptions.has(description)) {
      codeEntry.descriptions.set(description, row.description.trim());
    }
    codeEntry.rows.push(index);
    byCode.set(code, codeEntry);

    if (!description) return;
    const descriptionEntry = byDescription.get(description) ?? {
      codes: new Map<string, string>(),
      rows: [] as number[],
    };
    if (!descriptionEntry.codes.has(code)) descriptionEntry.codes.set(code, row.class.trim());
    descriptionEntry.rows.push(index);
    byDescription.set(description, descriptionEntry);
  });

  const codesWithSeveralDescriptions: CodebookCheck['codesWithSeveralDescriptions'] = [];
  for (const [key, entry] of byCode) {
    if (entry.descriptions.size > 1) {
      codesWithSeveralDescriptions.push({
        name: entry.name,
        key,
        descriptions: [...entry.descriptions.values()],
      });
      entry.rows.forEach((index) => rowsToMark.add(index));
    }
  }
  const sharedDescriptions: { codes: string[] }[] = [];
  for (const entry of byDescription.values()) {
    if (entry.codes.size > 1) {
      sharedDescriptions.push({ codes: [...entry.codes.values()] });
      entry.rows.forEach((index) => rowsToMark.add(index));
    }
  }
  repeatedRows.forEach((index) => rowsToMark.add(index));
  return { repeatedRows, codesWithSeveralDescriptions, sharedDescriptions, rowsToMark };
}

export const hasCodebookProblems = (check: CodebookCheck) => check.rowsToMark.size > 0;

const quoted = (names: string[]) => {
  const items = names.map((name) => `“${name}”`);
  const last = items.pop();
  return items.length === 0 ? (last ?? '') : `${items.join(', ')} and ${last ?? ''}`;
};

/** One suggestion per kind of problem, for the card and the Edit dialog. */
export function codebookSuggestions(
  rows: AnnotationClassDescriptionRow[],
  check: CodebookCheck,
): string[] {
  const suggestions: string[] = [];
  if (check.repeatedRows.length > 0) {
    const names = [...new Set(check.repeatedRows.map((index) => rows[index]?.class.trim() ?? ''))];
    suggestions.push(
      `${quoted(names)} ${names.length === 1 ? 'appears' : 'appear'} more than once with the same description. Remove the repeated rows.`,
    );
  }
  for (const { name, descriptions } of check.codesWithSeveralDescriptions) {
    suggestions.push(
      `“${name}” has ${String(descriptions.length)} different descriptions. Choose one, merge them, or rename one of the codes.`,
    );
  }
  for (const { codes } of check.sharedDescriptions) {
    suggestions.push(
      `${quoted(codes)} have the same description. Give each code its own description, or merge them into one code.`,
    );
  }
  return suggestions;
}

/** The rows without the ones that repeat an earlier row. */
export function withoutRepeatedRows(
  rows: AnnotationClassDescriptionRow[],
): AnnotationClassDescriptionRow[] {
  const repeated = new Set(checkCodebook(rows).repeatedRows);
  return rows.filter((_, index) => !repeated.has(index));
}

/** Descriptions joined into one, each kept in full. */
export const mergedDescription = (descriptions: string[]) =>
  descriptions.filter((description) => description.length > 0).join('; ');

/**
 * Keep one row for the code `key`, where it first appears, with `description`;
 * the code's other rows are removed. Other codes are left as they are.
 */
export function resolveCode(
  rows: AnnotationClassDescriptionRow[],
  key: string,
  description: string,
): AnnotationClassDescriptionRow[] {
  let kept = false;
  return rows.flatMap((row) => {
    if (codeKey(row.class) !== key) return [row];
    if (kept) return [];
    kept = true;
    return [{ ...row, description }];
  });
}
