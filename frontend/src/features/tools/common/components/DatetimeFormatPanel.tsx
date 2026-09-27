import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DatetimeFormatPanelProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (format?: string) => Promise<void>;
  columnName: string;
}

/** Manual fallback after bounded automatic datetime discovery could not resolve the format. */
export function DatetimeFormatPanel({ open, onClose, ...props }: DatetimeFormatPanelProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && <DatetimeFormatForm {...props} onClose={onClose} />}
    </Dialog>
  );
}

function DatetimeFormatForm({
  columnName,
  onConfirm,
  onClose,
}: Omit<DatetimeFormatPanelProps, 'open'>) {
  const [format, setFormat] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Convert {columnName} to datetime</DialogTitle>
        <DialogDescription>
          Automatic conversion could not determine a format from up to 200 rows. Enter a format;
          timezone directives preserve timezone-aware values.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!format.trim() || pending) return;
          setPending(true);
          void onConfirm(format.trim()).finally(() => {
            setPending(false);
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="datetime-format">Datetime format</Label>
          <Input
            id="datetime-format"
            value={format}
            onChange={(event) => {
              setFormat(event.target.value);
            }}
            placeholder="e.g., %Y-%m-%d %H:%M:%S"
          />
          <p className="text-label-secondary text-description">
            Use strptime codes such as .%f for fractional seconds and %z for UTC offsets. For
            example: %Y-%m-%d %H:%M:%S.%f %z.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !format.trim()}>
            {pending ? 'Converting…' : 'Convert'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
