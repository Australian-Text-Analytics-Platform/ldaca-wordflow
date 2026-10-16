import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorNotice } from '@/components/errors/ErrorNotice';

interface FilePreviewData {
  previewData: Record<string, unknown>[];
  columns: string[];
  loading: boolean;
  /** The preview failure, shown in plain words with Details (issue 205). */
  error: unknown;
  fileType: string | null;
  sheetNames: string[] | null;
  selectedSheet: string | null;
  setSelectedSheet: (sheet: string | null) => void;
}

interface FilePreviewContentProps {
  filename: string;
  open: boolean;
  onClose: () => void;
  onSheetChange?: (sheet: string | null) => void;
  data: FilePreviewData;
  dialogMaxWidth?: string;
  cardMaxHeight?: string;
  title?: string;
  description?: string;
  headerSlot?: React.ReactNode;
  footer: React.ReactNode;
  /** Leaves out the preview table, for a selection that lists its files instead. */
  hidePreview?: boolean;
  /** What the preview shows, named after its heading (issue 323). */
  previewLabel?: string;
  /** A line under the preview heading, such as how to choose what it shows. */
  previewHint?: string;
}

/** Preview column widths a drag or arrow key can set (issue 400). */
const MIN_COLUMN_WIDTH = 64;
const MAX_COLUMN_WIDTH = 1200;
/** The default width cap (12rem), where a column starts when first dragged. */
const DEFAULT_COLUMN_WIDTH = 192;
const KEY_STEP = 16;

/**
 * A cell shows one line, so a long text is cut before it reaches the page:
 * Safari's engine (also the Mac desktop app) draws a very long single line
 * (about 40,000 characters) as blank, leaving only the "…" (issue 400).
 */
const MAX_CELL_CHARACTERS = 2000;
const cellText = (value: unknown): string => {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return text.length > MAX_CELL_CHARACTERS ? `${text.slice(0, MAX_CELL_CHARACTERS)}…` : text;
};

const clampWidth = (width: number) =>
  Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));

/**
 * A drag handle on a preview column's right edge (issue 400). Drag or use the
 * arrow keys to widen the column and see more of its text; double-click to
 * restore the default width.
 */
function ColumnResizeHandle({
  column,
  width,
  onResize,
  onReset,
}: {
  column: string;
  width: number | undefined;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize column ${column}`}
      aria-valuenow={width ?? DEFAULT_COLUMN_WIDTH}
      aria-valuemin={MIN_COLUMN_WIDTH}
      aria-valuemax={MAX_COLUMN_WIDTH}
      tabIndex={0}
      title="Drag to resize; double-click to reset"
      className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none select-none hover:bg-focus/40 focus-visible:bg-focus/60 focus-visible:outline-none"
      onPointerDown={(event) => {
        event.preventDefault();
        const th = event.currentTarget.parentElement;
        start.current = {
          x: event.clientX,
          width: width ?? th?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTH,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onResize(clampWidth(start.current.width + event.clientX - start.current.x));
      }}
      onPointerUp={(event) => {
        start.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const current = width ?? DEFAULT_COLUMN_WIDTH;
        onResize(clampWidth(current + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP)));
      }}
    />
  );
}

/**
 * Shared file preview layout used by AddFilePanel and FilePreviewPanel.
 * Owns the Dialog + Card chrome, Excel sheet selector, and preview table.
 * Callers provide footer buttons and optional header content via slots.
 *
 * Rendered by: AddFilePanel (confirm dialog with language selector), FilePreviewPanel (read-only preview with pagination).
 * Flow: render Dialog skeleton, Card with header/content/footer, then
 * optionally render a sheet selector for Excel files, followed by a preview
 * table that handles loading / error / empty / data states.
 */
export function FilePreviewContent({
  filename,
  open,
  onClose,
  onSheetChange,
  data,
  dialogMaxWidth = 'min(80vw, 960px)',
  cardMaxHeight = '90vh',
  title,
  description,
  headerSlot,
  footer,
  hidePreview = false,
  previewLabel,
  previewHint,
}: FilePreviewContentProps) {
  const isOpen = open && Boolean(filename);
  const {
    previewData,
    columns,
    loading,
    error,
    fileType,
    sheetNames,
    selectedSheet,
    setSelectedSheet,
  } = data;
  // Widths set by dragging a column's edge; unset columns keep the 12rem cap.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const widthStyle = (column: string): React.CSSProperties | undefined => {
    const width = columnWidths[column];
    return width === undefined ? undefined : { width, minWidth: width, maxWidth: width };
  };

  const handleSheetChange = (value: string) => {
    const next = value || null;
    setSelectedSheet(next);
    onSheetChange?.(next);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="w-full border-none bg-transparent p-0 shadow-none"
        style={{ maxWidth: dialogMaxWidth }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title ?? `Preview: ${filename}`}</DialogTitle>
          <DialogDescription>
            {description ?? 'Inspect file content before adding to Project.'}
          </DialogDescription>
        </DialogHeader>
        <Card className="flex w-full min-w-0 flex-col" style={{ maxHeight: cardMaxHeight }}>
          <CardHeader className="border-b px-6 py-4">
            <CardTitle className="truncate text-heading-3 font-semibold">
              {title ?? `File${filename ? `: ${filename}` : ''}`}
            </CardTitle>
            <CardDescription>{description ?? ''}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-w-0 space-y-4 overflow-auto px-6 py-6">
            {headerSlot}
            {fileType === 'excel' && sheetNames && sheetNames.length > 0 && (
              <div>
                <label className="mb-2 block text-body font-medium text-foreground">Sheet</label>
                <Select value={selectedSheet ?? ''} onValueChange={handleSheetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-label-secondary text-description">
                  The first sheet loads by default. Choose another to refresh the preview.
                </p>
              </div>
            )}
            <div hidden={hidePreview}>
              <div className="mb-2">
                <p className="truncate text-body font-medium text-foreground">
                  {previewLabel ? `Preview: ${previewLabel}` : 'Preview (first rows)'}
                </p>
                {previewHint ? (
                  <p className="text-label-secondary text-description">{previewHint}</p>
                ) : null}
              </div>
              <div className="max-h-60 w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto rounded-sm border border-surface-border">
                {loading ? (
                  <div className="p-4 text-body text-description">Loading…</div>
                ) : error ? (
                  <div className="p-4">
                    <ErrorNotice error={error} fallback="Couldn't load the preview." />
                  </div>
                ) : previewData.length === 0 ? (
                  <div className="p-4 text-body text-description">No preview</div>
                ) : (
                  <table className="min-w-max text-label-secondary">
                    <thead>
                      <tr className="bg-panel">
                        {columns.map((column) => (
                          <th
                            key={column}
                            className="relative truncate px-2 py-1 text-left font-medium"
                            style={widthStyle(column)}
                          >
                            {column}
                            <ColumnResizeHandle
                              column={column}
                              width={columnWidths[column]}
                              onResize={(width) => {
                                setColumnWidths((current) => ({ ...current, [column]: width }));
                              }}
                              onReset={() => {
                                setColumnWidths(({ [column]: _removed, ...rest }) => rest);
                              }}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 ? 'bg-panel/50' : 'bg-editor'}>
                          {columns.map((column) => (
                            <td
                              key={column}
                              className={
                                columnWidths[column] === undefined
                                  ? 'max-w-48 truncate px-2 py-1'
                                  : 'truncate px-2 py-1'
                              }
                              style={widthStyle(column)}
                              title={cellText(row[column])}
                            >
                              {cellText(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </CardContent>
          {footer}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
