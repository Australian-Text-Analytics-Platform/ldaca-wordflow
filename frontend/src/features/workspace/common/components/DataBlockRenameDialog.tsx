import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toastError } from '@/lib/toastError';

interface DataBlockRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Applies the name. Reject to keep the dialog open with the text selected. */
  onRename: (name: string) => unknown;
}

/**
 * Canonical Data Block rename dialog shared by graph cards and sidebar rows.
 * The caller owns the draft so each entry point can seed it from its current
 * node before opening; this component owns validation and modal geometry.
 * A failed rename shows a toast and keeps the dialog open with the text
 * selected, as the shared inline rename rule does (issue 210).
 */
export function DataBlockRenameDialog({
  open,
  onOpenChange,
  currentName,
  value,
  onValueChange,
  onRename,
}: DataBlockRenameDialogProps) {
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedValue = value.trim();
  const canRename = trimmedValue.length > 0 && trimmedValue !== currentName && !pending;

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRename) return;
    setPending(true);
    try {
      await onRename(trimmedValue);
      onOpenChange(false);
    } catch (error) {
      toastError(error, 'Try again.', { title: "Couldn't rename the Data Block." });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] min-w-0 max-w-lg">
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle>Rename Data Block</AlertDialogTitle>
            <AlertDialogDescription>Enter a new name for this Data Block.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            ref={inputRef}
            value={value}
            readOnly={pending}
            onChange={(event) => {
              onValueChange(event.target.value);
            }}
            aria-label="New Data Block name"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" disabled={!canRename}>
              Rename
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
