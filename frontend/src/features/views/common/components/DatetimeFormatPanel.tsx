import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { inferDatetimeFormat } from '../utils/datetimeFormatInfer';

interface DatetimeFormatPanelProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (format?: string) => void;
  columnName: string;
  sampleValues?: string[];
  /** The type being converted to, "datetime" or "date" (issue 187). */
  targetLabel?: string;
}

/**
 * Modal wrapper used by preprocessing flows before converting a column to
 * datetime. It keeps open/close ownership with the caller while mounting the
 * form only when the dialog is visible.
 */
export function DatetimeFormatPanel({ open, onClose, ...contentProps }: DatetimeFormatPanelProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      {open && <DatetimeFormatPanelContent {...contentProps} onClose={onClose} />}
    </Dialog>
  );
}

/**
 * Date format form used inside `DatetimeFormatPanel` (issue 205). It asks how
 * the dates are written, offers to detect it from sample values, and lists
 * common formats to choose from before the conversion is submitted.
 * Rendered by: DatetimeFormatPanel while the conversion dialog is open.
 * Flow: infer the initial format from samples, manage custom and auto-fill state, then render cancel/auto-fill/convert controls.
 */
function DatetimeFormatPanelContent({
  onClose,
  onConfirm,
  columnName,
  sampleValues = [],
  targetLabel = 'date and time',
}: Omit<DatetimeFormatPanelProps, 'open'>) {
  const initialFormat = sampleValues.length ? inferDatetimeFormat(sampleValues) : null;
  const [customFormat, setCustomFormat] = useState(initialFormat ?? '');
  const [detectTried, setDetectTried] = useState(sampleValues.length > 0);
  const [detectFailed, setDetectFailed] = useState(sampleValues.length > 0 && !initialFormat);

  /** Called by: DatetimeFormatPanelContent Cancel button. */
  const handleCancel = () => {
    onClose();
  };

  /** Called by: DatetimeFormatPanelContent "Detect from the data" button. */
  const handleDetect = () => {
    setDetectTried(true);
    const inferred = inferDatetimeFormat(sampleValues);
    setDetectFailed(!inferred);
    if (inferred) setCustomFormat(inferred);
  };

  /** Called by: DatetimeFormatPanelContent Convert button. */
  const handleConfirm = () => {
    const trimmed = customFormat.trim();
    onConfirm(trimmed.length ? trimmed : undefined);
    onClose();
  };

  const samples = [...new Set(sampleValues.map((value) => value.trim()).filter(Boolean))].slice(
    0,
    3,
  );

  return (
    <DialogContent className="w-full max-w-lg border-none bg-transparent p-0 shadow-none">
      <DialogHeader className="sr-only">
        <DialogTitle>
          Convert {columnName || 'column'} to {targetLabel}
        </DialogTitle>
        <DialogDescription>How are the dates written?</DialogDescription>
      </DialogHeader>
      <Card>
        <CardHeader>
          <CardTitle>
            Convert <span className="text-description">&ldquo;{columnName}&rdquo;</span> to{' '}
            {targetLabel}
          </CardTitle>
          <CardDescription>
            How are the dates written? Wordflow can work it out from the data, or you can enter the
            format.
            {samples.length > 0 ? (
              <span className="mt-1 block">
                In this column: <span className="font-mono">{samples.join(', ')}</span>
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor="datetime-format" className="text-body font-medium text-foreground">
                Date format
              </label>
              <Button
                type="button"
                onClick={handleDetect}
                variant="outline"
                size="sm"
                className="h-7 px-2"
              >
                Detect from the data
              </Button>
            </div>
            <input
              id="datetime-format"
              type="text"
              placeholder="for example %d/%m/%Y"
              value={customFormat}
              onChange={(event) => {
                setCustomFormat(event.target.value);
              }}
              className="w-full rounded-md border border-input-border bg-editor px-3 py-2 font-mono text-body text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus"
            />
            <div className="mt-1 text-label-secondary" aria-live="polite">
              {detectTried && detectFailed ? (
                <span className="text-error">
                  Couldn&apos;t work out the date format. Enter it above, or choose an example
                  below.
                </span>
              ) : detectTried && customFormat ? (
                <span className="text-[var(--vscode-charts-green)]">Worked out from the data.</span>
              ) : null}
            </div>
          </div>
          <div>
            <p className="mb-1 text-label-secondary text-description">
              Examples (choose one to use it). %d is the day, %m the month number, %b the short
              month name, %Y the year, %H the hour and %M the minute.
            </p>
            <div className="grid gap-0.5 text-label-secondary">
              {DATE_FORMAT_EXAMPLES.map(([example, format]) => (
                <button
                  key={format}
                  type="button"
                  aria-label={`Use ${format} for dates like ${example}`}
                  className="grid grid-cols-[11rem_1fr] rounded-sm px-1 text-left hover:bg-list-hover"
                  onClick={() => {
                    setCustomFormat(format);
                    setDetectFailed(false);
                  }}
                >
                  <span>{example}</span>
                  <span className="font-mono text-description">{format}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-surface-border/70 pt-4">
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} type="button">
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Convert</Button>
          </div>
        </CardFooter>
      </Card>
    </DialogContent>
  );
}

/** How dates are often written, with the format that reads them (issue 205). */
const DATE_FORMAT_EXAMPLES: [string, string][] = [
  ['30/01/2020', '%d/%m/%Y'],
  ['2020-01-30', '%Y-%m-%d'],
  ['30 Jan 2020', '%d %b %Y'],
  ['January 30, 2020', '%B %d, %Y'],
  ['30/01/2020 14:05', '%d/%m/%Y %H:%M'],
  ['2020-01-30 14:05:00', '%Y-%m-%d %H:%M:%S'],
];
