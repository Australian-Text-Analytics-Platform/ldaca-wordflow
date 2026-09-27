import type { MouseEvent } from 'react';

/** Preserve text selection and nested actions while making row whitespace useful. */
export function inspectAnalysisRow(event: MouseEvent, inspect: () => void) {
  if (
    window.getSelection()?.toString() ||
    (event.target instanceof Element &&
      event.target.closest('button, a, input, select, [role="button"]'))
  )
    return;
  inspect();
}
