import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ---- Public types ----

export interface RowDetailCustomization {
  /** Label shown in the dialog title parentheses, e.g. "Concordance" */
  label?: string;
  /** Key-value pairs shown in the metadata grid below the title */
  summaryFields?: {
    label: string;
    value: React.ReactNode;
    highlight?: boolean;
  }[];
  /**
   * Custom renderer for the full-text section.
   * Receives the raw text and the full row record.
   * Return `null` to hide the document section entirely.
   * Mark one element with `data-row-detail-anchor` to scroll the document box
   * to it when the dialog opens or the row changes.
   */
  renderDocumentText?: (text: string, record: Record<string, unknown>) => React.ReactNode;
  /**
   * Height cap for the document box (default `max-h-96`). A shorter box keeps
   * the metadata table in view below it; the box still scrolls.
   */
  documentMaxHeightClassName?: string;
}

export interface RowDetailNavigation {
  canPrevious: boolean;
  canNext: boolean;
  pendingDirection: 'previous' | 'next' | null;
  error: string | null;
  onPrevious: () => void;
  onNext: () => void;
}

export interface RowDetailPayload {
  /** The clicked row (all fields) */
  record: Record<string, unknown>;
  /** The text column key whose content is shown as the document body */
  textColumn?: string;
  /** Pre-resolved full text (if the text column maps to a different key) */
  fullText?: string;
  /** Columns to exclude from the metadata table (e.g. generated columns) */
  excludeMetadataColumns?: string[];
}

export interface RowDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: RowDetailPayload | null;
  customization?: RowDetailCustomization;
  navigation: RowDetailNavigation;
}

// ---- Helpers ----

/**
 * Converts arbitrary row metadata into displayable strings for the detail dialog
 * while preserving object structure for the preformatted metadata table.
 * Called by: RowDetailPanel metadata table rendering.
 */
const formatMetadataValue = (value: unknown): string => {
  // Shown blank, as in the Data View; "null" is jargon for most users (issue 176).
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isNaN(value)) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- value is a non-object primitive after the guards above; String() never yields '[object Object]'
  return String(value);
};

/** Space kept above the document anchor so the preceding context stays visible. */
const DOCUMENT_ANCHOR_MARGIN_PX = 48;

/**
 * Scrolls only the document box so its `data-row-detail-anchor` element sits
 * near the top, or back to the start when the renderer marks no anchor.
 * Called by: RowDetailPanel after the dialog opens or its payload changes.
 */
/**
 * A stable key per row record. The document box is remounted for each row:
 * Safari could keep painting the previous row's highlights (or their absence)
 * when the same scrolled box was updated in place and scrolled in one frame.
 */
const recordKeys = new WeakMap<object, number>();
let nextRecordKey = 0;
const keyForRecord = (record: object): number => {
  let key = recordKeys.get(record);
  if (key === undefined) {
    nextRecordKey += 1;
    key = nextRecordKey;
    recordKeys.set(record, key);
  }
  return key;
};

const scrollDocumentToAnchor = (documentBox: HTMLElement) => {
  documentBox.scrollTop = 0;
  const anchor = documentBox.querySelector<HTMLElement>('[data-row-detail-anchor]');
  if (!anchor) return;
  const offset = anchor.getBoundingClientRect().top - documentBox.getBoundingClientRect().top;
  documentBox.scrollTop = Math.max(0, offset - DOCUMENT_ANCHOR_MARGIN_PX);
};

// ---- Component ----

/**
 * Opens the shared row-detail dialog used by analysis tables to inspect full
 * document text, custom summary fields, and remaining row metadata.
 * Used by: concordance and quotation result row detail flows.
 */
export function RowDetailPanel({
  open,
  onOpenChange,
  payload,
  customization,
  navigation,
}: RowDetailPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // State rather than a ref: Radix mounts dialog content after the render that
  // opens it, so the effect must rerun once the document box exists.
  const [documentBox, setDocumentBox] = useState<HTMLDivElement | null>(null);

  // Resets the dialog to the top and brings the renderer's anchor (such as the
  // first extracted quote) into view inside the document box, leaving the
  // summary fields above it visible.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (documentBox) scrollDocumentToAnchor(documentBox);
  }, [payload, open, documentBox]);

  if (!payload) return null;

  const { record, textColumn, fullText, excludeMetadataColumns } = payload;
  const excludeSet = new Set(excludeMetadataColumns ?? []);
  if (textColumn) excludeSet.add(textColumn);

  const rawText =
    fullText ??
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- text column holds document text (string content); explicit String() guards against non-string cells
    (textColumn && record[textColumn] != null ? String(record[textColumn]) : undefined);

  const titleSuffix = customization?.label ? ` (${customization.label})` : '';

  const documentContent = (() => {
    if (!rawText) return null;
    if (customization?.renderDocumentText) {
      return customization.renderDocumentText(rawText, record);
    }
    return rawText;
  })();

  const metadataEntries = Object.entries(record).filter(([key]) => !excludeSet.has(key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[80vh] w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Row Details{titleSuffix}</DialogTitle>
          <DialogDescription className="sr-only">
            Full row text and metadata for the selected result.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          data-testid="row-detail-scroll"
          className="min-h-0 overflow-y-auto pr-1"
        >
          {/* Summary / customization fields */}
          {customization?.summaryFields && customization.summaryFields.length > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-4 text-body">
              {customization.summaryFields.map((field) => (
                <div key={field.label}>
                  <span className="font-medium text-foreground">{field.label}:</span>
                  <span
                    className={`ml-2 ${field.highlight ? 'font-mono bg-[var(--vscode-editor-findMatchHighlightBackground)] px-1 rounded-sm' : ''}`}
                  >
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Document text */}
          {documentContent !== null && (
            <div className="mb-6">
              <h4 className="font-medium text-foreground mb-2">
                Document{textColumn ? `: ${textColumn}` : ''}
              </h4>
              <div className="bg-panel p-4 rounded-lg border">
                <div
                  key={keyForRecord(record)}
                  ref={setDocumentBox}
                  data-testid="row-detail-document"
                  className={cn(
                    'font-mono text-body whitespace-pre-wrap overflow-y-auto',
                    customization?.documentMaxHeightClassName ?? 'max-h-96',
                  )}
                >
                  {documentContent}
                </div>
              </div>
            </div>
          )}

          {/* Metadata table */}
          {metadataEntries.length > 0 && (
            <div>
              <h4 className="font-medium text-foreground mb-2">Metadata</h4>
              <div className="bg-surface border border-surface-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-panel">
                    <TableRow>
                      <TableHead className="px-3 py-2 text-left text-label-secondary font-medium uppercase tracking-wider text-description">
                        Field
                      </TableHead>
                      <TableHead className="px-3 py-2 text-left text-label-secondary font-medium uppercase tracking-wider text-description">
                        Value
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metadataEntries.map(([key, value]) => {
                      const displayValue = formatMetadataValue(value);
                      return (
                        <TableRow key={key}>
                          <TableCell className="font-medium">{key}</TableCell>
                          <TableCell>
                            <div className="max-w-md whitespace-pre-wrap wrap-break-word">
                              {typeof value === 'object' && value !== null ? (
                                <pre className="text-label-secondary bg-panel p-2 rounded-sm overflow-x-auto">
                                  {displayValue}
                                </pre>
                              ) : (
                                displayValue
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter
          data-testid="row-detail-navigation"
          className="border-t border-surface-border pt-3 sm:justify-between sm:space-x-0"
        >
          <Button
            type="button"
            variant="outline"
            onClick={navigation.onPrevious}
            disabled={!navigation.canPrevious || navigation.pendingDirection !== null}
            aria-label="Previous row"
          >
            {navigation.pendingDirection === 'previous' ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <ChevronLeft aria-hidden="true" />
            )}
            Previous row
          </Button>
          {navigation.error ? (
            <p role="alert" className="self-center text-body text-error">
              {navigation.error}
            </p>
          ) : navigation.pendingDirection ? (
            <p role="status" className="self-center text-body text-description">
              Loading {navigation.pendingDirection} row…
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={navigation.onNext}
            disabled={!navigation.canNext || navigation.pendingDirection !== null}
            aria-label="Next row"
          >
            Next row
            {navigation.pendingDirection === 'next' ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
