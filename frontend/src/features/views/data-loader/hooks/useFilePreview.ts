import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listFileWorksheets, previewFileTable } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { isWorkbookPath } from '../utils/fileTreeHelpers';

/** Manages paginated file preview state for the data-loader preview dialog. */
/**
 * Used by: `AddFilePanel` and `FilePreviewPanel`.
 * Flow: reset page/sheet state when the dialog closes, query the requested preview page, then expose rows, columns, paging, and sheet controls.
 */
export const useFilePreview = (
  filename: string | null,
  isOpen: boolean,
  /** A table file inside the ZIP named by `filename` (issue 136). */
  member: string | null = null,
  /**
   * A sheet chosen elsewhere (a row of the Add window, issue 323): previews
   * that sheet, or the first with null, and offers no Sheet menu.
   */
  fixedSheet?: string | null,
) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- Resetting local UI state on prop change; no cascading renders */
  useEffect(() => {
    if (!isOpen) {
      setPage(1);
      setSelectedSheet(null);
    }
  }, [isOpen, filename]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasFixedSheet = fixedSheet !== undefined;
  // Every workbook format, .xlsm and .ods included (issue 323).
  const isExcel = !member && !hasFixedSheet && Boolean(filename && isWorkbookPath(filename));
  const worksheetsQuery = useQuery({
    queryKey: queryKeys.fileWorksheets(filename ?? ''),
    queryFn: async () => {
      if (!filename) throw new Error('No filename provided');
      const { data } = await listFileWorksheets({
        query: { path: filename },
        throwOnError: true,
      });
      return data;
    },
    enabled: Boolean(filename && isOpen && isExcel),
    staleTime: 5 * 60 * 1000,
  });

  const sheet = hasFixedSheet ? fixedSheet : selectedSheet;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.filePreview(filename ?? '', page, pageSize, sheet, member),
    /** Loads the current preview page only when the dialog has a filename to display. */
    /** Called by: TanStack Query inside useFilePreview. */
    queryFn: async () => {
      if (!filename) throw new Error('No filename provided');
      return previewFileTable({
        query: {
          path: filename,
          page,
          page_size: pageSize,
          sheet_name: sheet,
          member,
        },
      });
    },
    enabled: !!filename && isOpen,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const reset = () => {
    setPage(1);
    setSelectedSheet(null);
  };

  return {
    previewData: data?.rows ?? [],
    columns: data?.columns ?? [],
    hasNext: data?.hasNext ?? false,
    fileType: isExcel ? 'excel' : null,
    sheetNames: worksheetsQuery.data?.sheets ?? null,
    selectedSheet: selectedSheet ?? worksheetsQuery.data?.default_sheet ?? null,
    setSelectedSheet,
    page,
    setPage,
    pageSize,
    setPageSize,
    loading: isLoading,
    // The error itself, so the reason and its Details can show (issue 205).
    error: isError ? error : null,
    reset,
  };
};
