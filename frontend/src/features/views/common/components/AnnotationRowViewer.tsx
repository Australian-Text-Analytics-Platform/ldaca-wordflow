import { Maximize2 } from 'lucide-react';

/** The small per-row button that opens the row viewer. */
export function AnnotationRowViewButton({
  rowNumber,
  onClick,
}: {
  rowNumber: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`View row ${String(rowNumber)}`}
      title="View the whole row"
      onClick={onClick}
      className="inline-flex size-6 items-center justify-center rounded-sm text-description hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Maximize2 className="size-3.5" aria-hidden="true" />
    </button>
  );
}
