import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CHART_FORMATS, type ChartExportFormat } from '../chartExport';

export function DownloadButton({
  label = 'Download chart',
  disabled,
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Download className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface Props<Format extends string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  formats: readonly { value: Format; label: string }[];
  defaultFormat: Format;
  formatLabel?: string;
  disabled?: boolean;
  actionLabel?: string;
  onExport: (format: Format) => Promise<string | null>;
  onError?: (error: unknown) => void;
  children?: (pending: boolean) => ReactNode;
}

/** The open session owns its choices; late completion cannot close a newer dialog. */
export function DownloadDialog<Format extends string>(props: Props<Format>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <DownloadOptions key={props.title} {...props} />}
    </Dialog>
  );
}

function DownloadOptions<Format extends string>({
  onOpenChange,
  title,
  description,
  formats,
  defaultFormat,
  disabled,
  formatLabel = 'Chart download format',
  actionLabel = 'Download',
  onExport,
  onError,
  children,
}: Props<Format>) {
  const id = useId();
  const [format, setFormat] = useState(defaultFormat);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const download = async () => {
    if (running.current || disabled) return;
    running.current = true;
    setPending(true);
    try {
      const saved = await onExport(format);
      if (saved !== null && mounted.current) onOpenChange(false);
    } catch (error) {
      // Mutations already report through the query observer; direct callers supply onError.
      onError?.(error);
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="break-words">{title}</DialogTitle>
        <DialogDescription>
          {pending
            ? 'Export continues after closing this dialog. Accepted exports can be cancelled in Tasks.'
            : description}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-format`}>Format</Label>
        <Select
          value={format}
          disabled={pending}
          onValueChange={(value) => {
            const chosen = formats.find((option) => option.value === value);
            if (chosen) setFormat(chosen.value);
          }}
        >
          <SelectTrigger id={`${id}-format`} aria-label={formatLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formats.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {children?.(pending)}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          {pending ? 'Close' : 'Cancel'}
        </Button>
        <Button type="button" disabled={pending || disabled} onClick={() => void download()}>
          {pending ? 'Exporting…' : actionLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function ChartDownload({
  disabled,
  onExport,
}: {
  disabled?: boolean;
  onExport: (format: ChartExportFormat) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DownloadButton
        disabled={disabled}
        onClick={() => {
          setOpen(true);
        }}
      />
      <DownloadDialog
        open={open}
        onOpenChange={setOpen}
        title="Download chart"
        description="Includes the displayed chart, source labels, legend and selection."
        formats={CHART_FORMATS}
        defaultFormat="png"
        disabled={disabled}
        onExport={onExport}
      />
    </>
  );
}
