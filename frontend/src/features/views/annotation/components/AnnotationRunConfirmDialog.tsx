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
import { buttonVariants } from '@/components/ui/button';
import type { RunTargetWording } from '../runTargetCheck';

/**
 * Asks before an AI Run writes into an annotation column that already holds
 * values (issue 499): what Run will keep, fill or overwrite there.
 */
export function AnnotationRunConfirmDialog({
  dialog,
  onConfirm,
  onClose,
}: {
  dialog: NonNullable<RunTargetWording['dialog']> | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
          <AlertDialogDescription>{dialog?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{dialog?.confirm ? 'Cancel' : 'OK'}</AlertDialogCancel>
          {dialog?.confirm ? (
            <AlertDialogAction
              className={
                dialog.destructive ? buttonVariants({ variant: 'destructive' }) : undefined
              }
              onClick={onConfirm}
            >
              {dialog.confirm}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
