import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRef, useState } from 'react';
import { OperationError } from '@/features/project/OperationError';

interface DataBlockRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  value: string;
  onValueChange: (value: string) => void;
  onRename: (name: string) => void | Promise<unknown>;
}

/**
 * Canonical Data Block rename dialog shared by graph cards and sidebar rows.
 * The caller owns the draft so each entry point can seed it from its current
 * node before opening; this component owns validation and modal geometry.
 */
export function DataBlockRenameDialog({
  open,
  onOpenChange,
  currentName,
  value,
  onValueChange,
  onRename,
}: DataBlockRenameDialogProps) {
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const trimmedValue = value.trim();
  const canRename = trimmedValue.length > 0 && trimmedValue !== currentName;

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRename || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onRename(trimmedValue);
      onOpenChange(false);
    } catch (cause) {
      setError(cause);
    } finally {
      submitting.current = false;
      setPending(false);
      queueMicrotask(() => {
        input.current?.focus();
        input.current?.select();
      });
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setError(undefined);
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent className="w-[calc(100vw-2rem)] min-w-0 max-w-lg">
        <form className="grid min-w-0 gap-3" onSubmit={handleSubmit}>
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle>Rename Data Block</AlertDialogTitle>
            <AlertDialogDescription>Enter a new name for this Data Block.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            ref={input}
            value={value}
            readOnly={pending}
            onChange={(event) => {
              onValueChange(event.target.value);
            }}
            aria-label="New Data Block name"
            autoFocus
          />
          {error !== undefined && (
            <OperationError error={error} title="Couldn't rename Data Block" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={!canRename || pending}>
              {pending ? 'Renaming…' : error ? 'Retry' : 'Rename'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
