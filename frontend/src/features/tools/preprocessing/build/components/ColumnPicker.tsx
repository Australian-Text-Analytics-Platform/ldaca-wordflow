import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import { buildType } from '../operations';
import { buildTypeLabel } from '../hooks/buildExpressionModel';

/** Insert a quoted column reference at the SQL editor cursor. */
export function ColumnPicker({
  columns,
  onColumn,
  disabled,
}: {
  columns: ColumnInfo[];
  onColumn: (column: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const matches = columns.filter((column) =>
    column.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          Insert column
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <Input
          aria-label="Search columns"
          placeholder="Search columns…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <div
          className="flex max-h-60 flex-col gap-1 overflow-y-auto"
          aria-label="Available columns"
        >
          {matches.map((column) => (
            <Button
              key={column.name}
              aria-label={column.name}
              variant="ghost"
              className="h-auto min-h-8 justify-between gap-2 whitespace-normal text-left"
              title={column.name}
              onClick={() => {
                onColumn(column.name);
                setOpen(false);
              }}
            >
              <span className="min-w-0 break-all">{column.name}</span>
              <span className="shrink-0 text-description">
                {buildTypeLabel(buildType(column.field))}
              </span>
            </Button>
          ))}
          {!matches.length && (
            <p className="py-2 text-body text-description">No matching columns</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
