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
export function ConfirmAction({
  title,
  description,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const opener = useRef(document.activeElement);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
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
        {error && <p role="alert">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              setPending(true);
              void onConfirm()
                .then(onClose)
                .catch(() => setError('The change could not be saved. Retry or cancel.'))
                .finally(() => setPending(false));
            }}
          >
            {pending ? 'Saving…' : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
