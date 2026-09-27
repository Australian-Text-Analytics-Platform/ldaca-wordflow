import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { useEditingGuard } from './useEditingNavigation';
import type { useTableEditing } from './useTableEditing';

export function EditingLeaveDialog({
  id,
  editor,
}: {
  id: string;
  editor: ReturnType<typeof useTableEditing>;
}) {
  const resolve = useRef<((leave: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  useEditingGuard(id, async () => {
    if (editor.busy) return false;
    if (!editor.modified) {
      try {
        await editor.cancelAsync();
        return true;
      } catch {
        return false;
      }
    }
    setOpen(true);
    return new Promise<boolean>((finish) => {
      resolve.current = finish;
    });
  });
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );
  function finish(leave: boolean) {
    resolve.current?.(leave);
    resolve.current = null;
    setOpen(false);
  }
  async function submit(save: boolean) {
    const answer = resolve.current;
    resolve.current = null;
    try {
      if (save) await editor.saveAsync();
      else await editor.cancelAsync();
      answer?.(true);
      setOpen(false);
    } catch {
      resolve.current =
        answer; /* The shared mutation observer reports the error; the editor and dialog stay open. */
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !editor.busy) finish(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your edits across all pages have not been saved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="ghost"
            disabled={editor.busy}
            onClick={() => {
              finish(false);
            }}
          >
            Stay
          </Button>
          <Button
            variant="outline"
            disabled={editor.busy}
            onClick={() => {
              void submit(false);
            }}
          >
            Discard
          </Button>
          <Button
            disabled={editor.busy}
            onClick={() => {
              void submit(true);
            }}
          >
            {editor.saving ? 'Saving…' : 'Save'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
