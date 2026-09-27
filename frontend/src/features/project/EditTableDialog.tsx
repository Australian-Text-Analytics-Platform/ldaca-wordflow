import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/isTauri';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EditableTable } from '@/features/table-editing/EditableTable';
import { useTableEditing } from '@/features/table-editing/useTableEditing';
import { reportProjectError } from './projectErrors';
import type { CellEditSession } from './api';

export function EditTableDialog({
  base,
  session,
  onFinished,
}: {
  base: string;
  session: CellEditSession;
  onFinished: (saved: boolean) => void | Promise<void>;
}) {
  const editor = useTableEditing({ base, session, onFinished });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishHint, setFinishHint] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void getCurrentWindow()
      .listen('focus-table-editor', () => {
        setFinishHint(true);
        content.current?.focus();
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(reportProjectError);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  function requestCancel() {
    if (editor.busy) return;
    if (editor.modified) setConfirmDiscard(true);
    else editor.cancel();
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestCancel();
        }}
      >
        <DialogContent
          ref={content}
          tabIndex={-1}
          className="flex h-[85vh] w-[calc(100%-2rem)] max-w-[90vw] flex-col"
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Table</DialogTitle>
            <DialogDescription className="break-all">
              {session.schema && session.schema !== 'data' ? `${session.schema}.` : ''}
              {session.table_name} — Changes are saved together when you choose Save.
            </DialogDescription>
          </DialogHeader>
          {finishHint && (
            <p role="status" className="text-body-secondary text-description">
              Finish table editing with Save or Cancel first.
            </p>
          )}
          <div className="min-h-0 flex-1">
            {editor.rows.isError ? (
              <Button
                variant="outline"
                onClick={() => {
                  void editor.rows.refetch();
                }}
              >
                Retry loading page
              </Button>
            ) : (
              <EditableTable editor={editor} />
            )}
          </div>
          <DialogFooter className="items-center gap-2">
            <span className="mr-auto text-body-secondary text-description" role="status">
              {editor.changedCells} changed cells
              {editor.addedRows > 0 &&
                ` · ${String(editor.addedRows)} added ${editor.addedRows === 1 ? 'row' : 'rows'}`}
              {editor.deletedRows > 0 &&
                ` · ${String(editor.deletedRows)} deleted ${editor.deletedRows === 1 ? 'row' : 'rows'}`}
            </span>
            <Button variant="outline" disabled={editor.busy} onClick={requestCancel}>
              Cancel
            </Button>
            <Button disabled={editor.busy || editor.rows.isPending} onClick={editor.save}>
              {editor.saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard table edits?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes across all pages will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={editor.cancel}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
