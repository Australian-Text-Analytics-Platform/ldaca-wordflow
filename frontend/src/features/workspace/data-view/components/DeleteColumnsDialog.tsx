import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { getColumnExamples } from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface DeleteColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: string[];
  onConfirm: (columns: string[]) => Promise<void>;
  /** The Data Block whose first values are shown as examples (issue 354). */
  workspaceId?: string;
  nodeId?: string;
}

/**
 * Picks several columns and deletes them in one Data Block Edit (issue 141),
 * so one Undo restores them all. At least one column must remain.
 */
export function DeleteColumnsDialog({
  open,
  onOpenChange,
  columns,
  onConfirm,
  workspaceId,
  nodeId,
}: DeleteColumnsDialogProps) {
  // Each column's first value, so unclear names can be recognised (issue 354).
  // The list works without them while they load or if they fail.
  const examplesQuery = useQuery({
    queryKey: ['workspaces', workspaceId, 'nodes', nodeId, 'column-examples'],
    enabled: open && Boolean(workspaceId && nodeId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data } = await getColumnExamples({
        path: { workspace_id: workspaceId ?? '', node_id: nodeId ?? '' },
        signal,
        throwOnError: true,
      });
      return data.examples;
    },
  });
  const examples = examplesQuery.data;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const needle = filter.trim().toLocaleLowerCase();
  const visible = needle
    ? columns.filter((column) => column.toLocaleLowerCase().includes(needle))
    : columns;
  const keepsNone = selected.size >= columns.length;

  const close = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      setSelected(new Set());
      setFilter('');
    }
    onOpenChange(next);
  };

  const toggle = (column: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(column);
      else next.delete(column);
      return next;
    });
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(columns.filter((column) => selected.has(column)));
      setSelected(new Set());
      setFilter('');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete columns</DialogTitle>
          <DialogDescription>
            Choose the columns to remove from this Data Block. Undo restores them in one step.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <Input
            aria-label="Filter columns"
            placeholder="Filter columns"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          <div className="flex items-center gap-2 text-label-secondary text-description">
            <span>
              {selected.size} of {columns.length} selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setSelected((current) => new Set([...current, ...visible]));
              }}
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setSelected(new Set());
              }}
            >
              Select none
            </Button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {visible.map((column) => (
              <li key={column} className="flex items-center gap-2 px-1">
                <Checkbox
                  id={`delete-column-${column}`}
                  checked={selected.has(column)}
                  onCheckedChange={(checked) => {
                    toggle(column, checked === true);
                  }}
                />
                <label
                  htmlFor={`delete-column-${column}`}
                  className="flex min-w-0 flex-1 items-baseline gap-2"
                >
                  <span className="max-w-[60%] shrink-0 truncate text-body">{column}</span>
                  {examples && column in examples ? (
                    <span
                      data-testid={`delete-column-example-${column}`}
                      className="min-w-0 truncate text-label-secondary text-description"
                    >
                      {examples[column] ?? <span className="italic">(empty)</span>}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="px-1 text-label-secondary text-description">
                No columns match the filter.
              </li>
            ) : null}
          </ul>
          {keepsNone ? (
            <p role="alert" className="text-label-secondary text-error">
              Keep at least one column.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => {
              close(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-error text-button-foreground hover:bg-error/90"
            disabled={submitting || selected.size === 0 || keepsNone}
            onClick={() => {
              void confirm();
            }}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete {selected.size} column{selected.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
