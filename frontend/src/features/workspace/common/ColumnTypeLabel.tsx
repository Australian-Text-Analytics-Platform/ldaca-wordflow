import type { ReactNode } from 'react';
import { ColumnTypeSymbol } from '@/features/workspace/data-view/components/ColumnTypeSymbol';
import { arrowTypeDisplayName, type ArrowField } from '@/lib/arrow/arrowTable';

/**
 * A column's name behind its type symbol, for a menu item that is not a
 * SearchableSelect option (a Select item, for example). Without a known type
 * it is the text alone.
 *
 * Give a Select item its column name as `textValue` too: typing a letter in
 * an open Select jumps to the item whose text starts with it, and the symbols
 * "Aa" and "123" are text.
 */
export function ColumnTypeLabel({
  field,
  children,
}: {
  field: ArrowField | undefined;
  children: ReactNode;
}) {
  if (!field) return <>{children}</>;
  return (
    <span className="inline-flex min-w-0 items-center">
      <span
        title={arrowTypeDisplayName(field)}
        className="mr-1.5 flex w-6 shrink-0 items-center justify-center text-description"
      >
        <ColumnTypeSymbol field={field} />
      </span>
      <span className="truncate">{children}</span>
    </span>
  );
}
