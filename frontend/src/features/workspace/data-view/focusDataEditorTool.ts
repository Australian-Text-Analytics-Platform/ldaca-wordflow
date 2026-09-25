/**
 * Moves focus into the open Data Editor tool's first field. The menus that
 * open a tool call it when they close, instead of returning focus to their
 * trigger; the panel also calls it on mount for tools opened another way.
 * Safari runs the menu's close callback late, after the user may already be
 * typing in the panel, so focus that is already in the panel stays put.
 */
const FIRST_FIELD =
  'textarea, input:not([type="radio"]):not([type="checkbox"]), button[role="combobox"]:not([aria-label="Insert column"])';

export function focusDataEditorTool(): void {
  const form = document.querySelector('[data-editor-tool-form]');
  if (!form || form.contains(document.activeElement)) return;
  form.querySelector<HTMLElement>(FIRST_FIELD)?.focus({ preventScroll: true });
}
