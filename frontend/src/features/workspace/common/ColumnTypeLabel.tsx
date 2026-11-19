import type { ReactNode } from 'react';
import { ColumnTypeSymbol } from '@/features/workspace/data-view/components/ColumnTypeSymbol';
import { arrowTypeDisplayName, type ArrowField } from '@/lib/arrow/arrowTable';
import { cn } from '@/lib/utils';

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
      <ColumnTypeMark field={field} className="mr-1.5" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A column's type symbol alone, in a slot of fixed width so the names beside
 * it line up, with the type's plain name as its hover text. For a row that
 * lays out its own text; without a known type it draws nothing.
 */
export function ColumnTypeMark({
  field,
  className,
}: {
  field: ArrowField | undefined;
  className?: string;
}) {
  if (!field) return null;
  return (
    <span
      title={arrowTypeDisplayName(field)}
      className={cn('flex w-6 shrink-0 items-center justify-center text-description', className)}
    >
      <ColumnTypeSymbol field={field} />
    </span>
  );
}
