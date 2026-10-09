import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { OperationError } from '@/features/project/OperationError';

interface RenameInputProps {
  column: string;
  onSubmit: (column: string, value: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Provides the inline editor opened from a column's settings menu.
 */
export function RenameInput({ column, onSubmit, onCancel }: RenameInputProps) {
  const [draft, setDraft] = useState(column);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onSubmit(column, draft.trim());
    } catch (cause) {
      setError(cause);
      inputRef.current?.focus();
      inputRef.current?.select();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="min-w-0">
      <Input
        ref={inputRef}
        value={draft}
        readOnly={pending}
        aria-busy={pending}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (!error) void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            if (!pending) onCancel();
          }
        }}
        className="h-7 w-40 truncate text-label-secondary"
        aria-label={`Rename column ${column}`}
      />
      {error !== undefined && (
        <OperationError
          error={error}
          title="Couldn't rename column"
          onRetry={() => void submit()}
        />
      )}
    </div>
  );
}
