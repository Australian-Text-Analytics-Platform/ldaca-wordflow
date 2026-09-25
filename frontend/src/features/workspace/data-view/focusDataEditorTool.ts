/**
 * Moves focus into the open Data Editor tool's first field. The menus that
 * open a tool call it when they close, instead of returning focus to their
 * trigger; the panel also calls it on mount for tools opened another way.
 */
const FIRST_FIELD =
  'textarea, input:not([type="radio"]):not([type="checkbox"]), button[role="combobox"]:not([aria-label="Insert column"])';

export function focusDataEditorTool(): void {
  document
    .querySelector('[data-editor-tool-form]')
    ?.querySelector<HTMLElement>(FIRST_FIELD)
    ?.focus({ preventScroll: true });
}
