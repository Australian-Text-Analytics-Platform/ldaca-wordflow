import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sqlTypes } from '../../api';

// Only ranking is local. Available types and aliases come from DuckDB.
const COMMON_TYPES = [
  'VARCHAR',
  'BOOLEAN',
  'INTEGER',
  'BIGINT',
  'DOUBLE',
  'DECIMAL',
  'DATE',
  'TIMESTAMP',
  'TIMESTAMPTZ',
];

export function SqlTypeDialog({
  base,
  column,
  nodeName,
  applying,
  onClose,
  onCast,
}: {
  base: string;
  column: string;
  nodeName: string;
  applying: boolean;
  onClose: () => void;
  onCast: (sqlType: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const catalogue = useQuery({
    queryKey: ['native', base, 'sql-types'],
    queryFn: ({ signal }) => sqlTypes(base, signal),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const search = value.trim().toLowerCase();
  const suggestions = (catalogue.data ?? []).filter((entry) =>
    [entry.name, entry.logical_type, entry.comment].join(' ').toLowerCase().includes(search),
  );
  const recommended = COMMON_TYPES.flatMap((name) =>
    suggestions.filter((entry) => entry.builtin && entry.name === name),
  );
  const others = suggestions.filter((entry) => !recommended.includes(entry));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Cast column</DialogTitle>
          <DialogDescription className="break-words">
            {nodeName ? `${nodeName} · ` : ''}
            {column}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>SQL type</Label>
          <Input
            id={inputId}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            placeholder="e.g. DECIMAL(18,4) or VARCHAR[]"
            className="font-mono"
          />
          <p className="text-label-secondary text-description">
            Choose a type or enter your own, including parameters such as DECIMAL(18,4) or
            VARCHAR[]. Nothing changes until you click Cast.
          </p>
        </div>
        <div className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto">
          {catalogue.isPending && <p role="status">Loading SQL types…</p>}
          {catalogue.isError && (
            <Button
              variant="outline"
              onClick={() => {
                void catalogue.refetch();
              }}
            >
              Retry loading types
            </Button>
          )}
          {recommended.length > 0 && (
            <Card role="region" aria-label="Recommended types">
              <CardHeader>
                <CardTitle>Recommended</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {recommended.map(({ name }) => (
                  <Button
                    key={name}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Use ${name}`}
                    onClick={() => {
                      setValue(name);
                    }}
                  >
                    {name}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
          {others.length > 0 && (
            <ul aria-label="Other SQL types" className="flex flex-col gap-1">
              {others.map(({ name, logical_type, comment, builtin }) => (
                <li key={name}>
                  <Button
                    type="button"
                    variant="ghost"
                    size={null}
                    aria-label={`Use ${name}`}
                    onClick={() => {
                      setValue(name);
                    }}
                    className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-2 py-2 text-left"
                  >
                    <span className="break-all font-mono">{name}</span>
                    <span className="text-label-secondary text-description">
                      {builtin ? logical_type : `Project type · ${logical_type}`}
                      {comment ? ` · ${comment}` : ''}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {catalogue.isSuccess && suggestions.length === 0 && (
            <p className="p-3 text-body-secondary text-description">
              No matching suggestions. You can still cast to the type entered above.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!value.trim()}
            onClick={() => {
              void onCast(value);
            }}
          >
            {applying ? 'Casting…' : 'Cast'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
