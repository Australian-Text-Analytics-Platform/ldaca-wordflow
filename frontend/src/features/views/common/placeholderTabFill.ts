import type React from 'react';

interface PlaceholderTabFillArgs {
  event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;
  value: string;
  setValue: (value: string) => void;
}

/**
 * Restores the caret after a placeholder is accepted without moving focus.
 * Called by: acceptPlaceholderOnTab after it copies a generated placeholder.
 * Flow: schedule after React commits the value, prefer animation-frame timing,
 * fall back to a timer, and move the caret only while the input retains focus.
 */
const scheduleCaretRestore = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const restore = () => {
    // Skip if the user has already typed: moving the caret then would drop
    // their next keys into the middle of the name ("replaced v2" became
    // "replaced2 v").
    if (document.activeElement !== input || input.value !== value) {
      return;
    }
    input.setSelectionRange(value.length, value.length);
  };

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restore);
    return;
  }

  setTimeout(restore, 0);
};

/**
 * Lets generated-name inputs accept a suggested placeholder on the first Tab
 * press while preserving normal focus traversal after a value exists.
 * Used by generated-name fields across preprocessing and Annotation because
 * those surfaces share the same keyboard interaction.
 * Flow: ignore modified/non-Tab keys and non-empty fields, copy the trimmed
 * placeholder, prevent that one focus move, then restore the caret.
 */
export const acceptPlaceholderOnTab = ({ event, value, setValue }: PlaceholderTabFillArgs) => {
  if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (value.trim().length > 0) {
    return;
  }

  const placeholder = event.currentTarget.placeholder.trim();
  if (!placeholder) {
    return;
  }

  event.preventDefault();
  setValue(placeholder);
  scheduleCaretRestore(event.currentTarget, placeholder);
};
