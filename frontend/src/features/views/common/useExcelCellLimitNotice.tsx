import { useCallback, useState } from 'react';

import { NudgeCard } from '@/features/nudges/NudgeCard';
import { useNudgeStore } from '@/features/nudges/nudgeStore';
import { excelCellLimitColumns, quotedColumns } from '@/lib/excelCellLimit';
import { toastError } from '@/lib/toastError';
import { getDocumentTarget } from '@/tutorials/documentationRegistry';
import { useUIStore } from '@/stores/uiStore';

const openExcelLimitHelp = () => {
  const target = getDocumentTarget('tutorial', 'analysis.export.excel-limit');
  if (target) useUIStore.getState().openDocument(target);
};

/**
 * The refusal as a toast with Learn more, where no suggestion can show: a
 * menu download, or with Suggestions turned off (issue 397).
 */
export function toastExcelCellLimit(error: unknown, title: string) {
  toastError(error, 'Choose CSV to keep the full text.', {
    title,
    duration: 20_000,
    action: { label: 'Learn more', onClick: openExcelLimitHelp },
  });
}

/**
 * An Excel download or export refused for text longer than a cell holds
 * shows as a suggestion beside the Format choice, naming the columns, with
 * Learn more (issue 397). The page can't know text lengths before the
 * backend writes the file, so it shows after the refusal.
 */
export function useExcelCellLimitNotice({ canUntick }: { canUntick: boolean }) {
  const [notice, setNotice] = useState<{ columns: string[]; occurrence: number } | null>(null);

  /** Handles an Excel cell-limit refusal; false for any other error. */
  const report = useCallback((error: unknown, title: string): boolean => {
    const columns = excelCellLimitColumns(error);
    if (!columns) return false;
    if (useNudgeStore.getState().enabled) {
      setNotice({ columns, occurrence: Date.now() });
    } else {
      toastExcelCellLimit(error, title);
    }
    return true;
  }, []);

  const clear = useCallback(() => {
    setNotice(null);
  }, []);

  let card = null;
  if (notice) {
    const several = notice.columns.length > 1;
    const names = quotedColumns(notice.columns);
    const detail = canUntick
      ? `${names} ${several ? 'have' : 'has'} text too long for an Excel cell. Untick ${several ? 'them' : 'it'} to download the other columns as Excel.`
      : `${names} ${several ? 'have' : 'has'} text too long for an Excel cell, so this can't be exported as Excel.`;
    card = (
      <NudgeCard
        id="excel-cell-limit"
        occurrence={notice.occurrence}
        detail={detail}
        className="mt-2"
      />
    );
  }
  return { report, clear, card };
}
