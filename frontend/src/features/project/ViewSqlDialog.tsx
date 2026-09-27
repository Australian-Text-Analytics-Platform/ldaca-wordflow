import { objectDependencies } from '@/features/project/projectChanges';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import * as api from './api';

/** Reads the catalogue once per opening; the draft belongs to this dialog until Save. */
export function ViewSqlDialog({
  base,
  name,
  onClose,
}: {
  base: string;
  name: api.DataTarget;
  onClose: () => void;
}) {
  const definition = useQuery({
    queryKey: ['native', base, 'definition', api.targetKey(name)],
    meta: objectDependencies(name),
    queryFn: ({ signal }) => api.viewDefinition(base, name, signal),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<string>();
  const sql = draft ?? definition.data?.sql ?? '';
  const save = useMutation({
    mutationFn: () => api.replaceViewDefinition(base, name, sql),
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit SQL Definition</DialogTitle>
          <DialogDescription className="break-all">{api.targetLabel(name)}</DialogDescription>
        </DialogHeader>
        <p className="text-body-secondary text-description">
          Edit the complete SELECT query. Save replaces this View’s definition.
        </p>
        {definition.isPending ? (
          <p role="status">Loading SQL definition…</p>
        ) : definition.isError ? (
          <Button
            variant="outline"
            onClick={() => {
              void definition.refetch();
            }}
          >
            Retry loading definition
          </Button>
        ) : (
          <Textarea
            aria-label="SQL definition"
            value={sql}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            disabled={save.isPending}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="h-[45vh] field-sizing-fixed resize-y font-mono"
          />
        )}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!definition.isSuccess || !sql.trim() || save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
