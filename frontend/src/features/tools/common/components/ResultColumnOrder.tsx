import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useState } from 'react';
import { resultColumnKey, type ResultColumn } from '../resultColumns';

export function ResultColumnOrder({
  columns,
  onChange,
}: {
  columns: ResultColumn[];
  onChange: (order: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const move = (key: string, to: number) => {
    const keys = columns.map(resultColumnKey);
    const from = keys.indexOf(key);
    if (from < 0 || to < 0 || to >= keys.length) return;
    keys.splice(to, 0, ...keys.splice(from, 1));
    onChange(keys);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Column order</Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-80 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <Input
          aria-label="Find result column"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a column…"
        />
        <p className="my-2 text-description text-label-secondary">
          Drag columns, use the arrows, or press Alt + ↑ / ↓.
        </p>
        {columns.map((column, index) => {
          if (!column.column.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return null;
          const key = resultColumnKey(column);
          return (
            <div
              key={key}
              className="flex items-center gap-2 py-1"
              draggable
              tabIndex={0}
              aria-label={`Order ${column.column}`}
              onDragStart={() => setDragged(key)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged) move(dragged, index);
              }}
              onKeyDown={(event) => {
                if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                  event.preventDefault();
                  move(key, index + (event.key === 'ArrowUp' ? -1 : 1));
                }
              }}
            >
              <GripVertical className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 break-words">{column.column}</span>
              <Button
                size="icon"
                variant="ghost"
                disabled={index === 0}
                aria-label={`Move ${column.column} up`}
                onClick={() => move(key, index - 1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={index === columns.length - 1}
                aria-label={`Move ${column.column} down`}
                onClick={() => move(key, index + 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
