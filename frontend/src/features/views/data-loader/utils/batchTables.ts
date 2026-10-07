/**
 * Table rows of the folder, selection, ZIP and workbook Add window (issues
 * 136, 309, 323). A workbook with more than one sheet becomes one row per
 * sheet, so several sheets can be added at once.
 */

/** One table to add: a user file, a ZIP member, and optionally a sheet. */
export interface BatchTableFile {
  /** Unique within the window. */
  id: string;
  label: string;
  /** The user file, or the member's path inside the ZIP being added. */
  path: string;
  /** The sheet of a workbook with several sheets; else the first loads. */
  sheet?: string;
}

/** A table file before its workbook sheets are known. */
export interface TableSource {
  path: string;
  label: string;
}

/**
 * One row per table, and one per sheet of a workbook with several sheets
 * (`survey.xlsx › Responses`). `sheetsOf` gives a workbook's sheet names, or
 * null for other files and for workbooks whose sheets couldn't be read (they
 * load their first sheet).
 */
export function expandSheets(
  sources: readonly TableSource[],
  sheetsOf: (path: string) => readonly string[] | null | undefined,
): BatchTableFile[] {
  return sources.flatMap((source) => {
    const sheets = sheetsOf(source.path) ?? [];
    if (sheets.length < 2) return [{ id: source.path, label: source.label, path: source.path }];
    return sheets.map((sheet) => ({
      id: `${source.path}\u0000${sheet}`,
      label: `${source.label} › ${sheet}`,
      path: source.path,
      sheet,
    }));
  });
}
