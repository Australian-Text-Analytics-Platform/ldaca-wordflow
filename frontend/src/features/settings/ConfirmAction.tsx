import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useRef, useState } from 'react';
import { OperationError } from '@/features/project/OperationError';
export function ConfirmAction({
  title,
  description,
  action,
  onConfirm,
  onClose,
  pendingLabel = 'Saving…',
}: {
  title: string;
  description: string;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  pendingLabel?: string;
}) {
  const opener = useRef(document.activeElement);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (
            opener.current instanceof HTMLElement &&
            opener.current.isConnected &&
            !opener.current.matches(':disabled')
          )
            opener.current.focus();
          else
            document
              .querySelector<HTMLElement>('[aria-label="Settings sections"] [aria-current="page"]')
              ?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {error != null && <OperationError error={error} title={`${title} failed`} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              setPending(true);
              void onConfirm()
                .then(onClose)
                .catch(setError)
                .finally(() => setPending(false));
            }}
          >
            {pending ? pendingLabel : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
