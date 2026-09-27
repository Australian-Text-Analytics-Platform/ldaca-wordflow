import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { toast } from 'sonner';

import { toastError } from '@/lib/toastError';

/**
 * One rule for every inline rename (issue 210): columns, Data Editor tabs,
 * analysis tabs, the Project name and Data Blocks.
 *
 * - Enter submits, and always tries again after a failure. Esc cancels.
 * - A failed rename shows a toast and keeps the box open with the text
 *   selected, so a typo or a name clash can be fixed straight away.
 * - Blur with the text unchanged since the failure closes the box and keeps
 *   the original name; no second request is sent.
 * - Blur with edited text submits it.
 * - Text equal to the original name closes without a request.
 *
 * In v0.8 Data Block names are DuckDB table names, so conflicts are expected;
 * keep this behaviour when reimplementing.
 */
export interface InlineRenameOptions {
  /** The current name; submitting it unchanged closes without a request. */
  original: string;
  /**
   * Applies the new (trimmed) name. Reject to fail with a toast built from
   * the error, or resolve `false` after showing your own message.
   */
  onSubmit: (name: string) => unknown;
  /** Closes the box: after success, cancel, or blur after a failure. */
  onClose: () => void;
  /** Local check before sending; a returned message fails the rename. */
  validate?: (name: string) => string | null;
  /** Toast title when `onSubmit` rejects. */
  failureTitle?: string;
}

interface InlineRenameInputProps {
  ref: RefObject<HTMLInputElement | null>;
  value: string;
  readOnly: boolean;
  'aria-invalid': true | undefined;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export interface InlineRename {
  inputProps: InlineRenameInputProps;
  pending: boolean;
  /** Submits the current text, as Enter does (for a separate Rename button). */
  submit: () => Promise<void>;
  cancel: () => void;
}

/** Draft, submit and failure state for one open rename box. */
export function useInlineRename({
  original,
  onSubmit,
  onClose,
  validate,
  failureTitle = "Couldn't rename.",
}: InlineRenameOptions): InlineRename {
  const [draft, setDraft] = useState(original);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef(false);
  const closedRef = useRef(false);

  const selectText = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    selectText();
  }, [selectText]);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  const fail = useCallback(
    (value: string) => {
      setFailedDraft(value);
      // A blur may have started this submit; take focus back so the text can
      // be fixed. The next blur with the same text then closes the box.
      requestAnimationFrame(selectText);
    },
    [selectText],
  );

  const submit = useCallback(async () => {
    if (pendingRef.current || closedRef.current) return;
    const value = draft;
    const name = value.trim();
    if (!name) {
      toast.error('Enter a name.');
      fail(value);
      return;
    }
    if (name === original) {
      close();
      return;
    }
    const problem = validate?.(name) ?? null;
    if (problem) {
      toast.error(problem);
      fail(value);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      const result = await onSubmit(name);
      if (result === false) {
        fail(value);
        return;
      }
      close();
    } catch (error) {
      toastError(error, 'Try again.', { title: failureTitle });
      fail(value);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [close, draft, fail, failureTitle, onSubmit, original, validate]);

  const cancel = useCallback(() => {
    close();
  }, [close]);

  const inputProps: InlineRenameInputProps = {
    ref: inputRef,
    value: draft,
    readOnly: pending,
    'aria-invalid': failedDraft !== null ? true : undefined,
    onChange: (event) => {
      setDraft(event.target.value);
    },
    onBlur: () => {
      if (pendingRef.current) return;
      if (failedDraft !== null && draft === failedDraft) {
        close();
        return;
      }
      void submit();
    },
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    },
  };

  return { inputProps, pending, submit, cancel };
}
