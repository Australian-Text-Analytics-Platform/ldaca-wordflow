import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
function requiredPlotColumns(r: api.PlotRequest): string[] {
  if ('axis' in r) return [r.axis, ...r.groups, ...(r.value ? [r.value] : [])];
  if ('category' in r)
    return [r.category, ...(r.stack ? [r.stack] : []), ...(r.value ? [r.value] : [])];
  if ('x' in r)
    return [r.x, r.y, ...[r.color, r.size, r.label].filter((v): v is string => v !== null)];
  if ('row' in r) return [r.row, r.column, ...(r.value ? [r.value] : [])];
  return [...r.stages, ...(r.value ? [r.value] : [])];
}
export function PlotPublishDialog({
  base,
  mode,
  result,
  request,
  query,
  selection,
  scope,
  onClose,
}: {
  base: string;
  mode: api.PlotMode;
  result: api.PlotAnalysis;
  request: api.PlotRequest;
  query: api.PlotQuery;
  selection: api.PlotSelection;
  scope: { summary: string; details: string[] };
  onClose: () => void;
}) {
  const [captured] = useState({ result, query, selection, scope });
  const required = requiredPlotColumns(request);
  const [name, setName] = useState(`${result.result.payload.source.name}_${mode}`);
  const [columns, setColumns] = useState([
    ...required,
    ...(result.result.payload.document_column ? [result.result.payload.document_column] : []),
  ]);
  const mutation = useMutation({
    mutationFn: () =>
      api.publishPlot(base, captured.result.id, mode, {
        name,
        columns,
        query: captured.query,
        selection: captured.selection,
      }),
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add original rows to Project</DialogTitle>
          <DialogDescription>
            Create an independent Table from the saved snapshot and current selection. With no
            selection, all eligible rows are included. Zoom does not restrict publication.
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-col gap-2 text-description"
          aria-label="Captured publication scope"
        >
          <p className="font-medium">{captured.scope.summary}</p>
          <p>
            Categories: {captured.query.uncased ? 'case variants combined' : 'exact case'}
            {mode === 'trends'
              ? ` · Minimum rows per group: ${String(captured.query.minimum_rows)}`
              : ''}
          </p>
          {captured.scope.details.length > 0 && (
            <details className="max-h-40 overflow-auto break-words">
              <summary>Selection and filters</summary>
              {captured.scope.details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </details>
          )}
        </div>
        <label>
          Name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setColumns(result.result.payload.columns.map(([name]) => name));
            }}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setColumns(required);
            }}
          >
            Select none
          </Button>
        </div>
        <div className="space-y-2">
          {result.result.payload.columns.map(([column]) => (
            <label key={column} className="flex items-center gap-2">
              <Checkbox
                checked={columns.includes(column)}
                disabled={required.includes(column)}
                onCheckedChange={(checked) => {
                  setColumns((old) =>
                    checked ? [...old, column] : old.filter((c) => c !== column),
                  );
                }}
              />
              {column}
              {required.includes(column) && (
                <span className="text-label-secondary">(required)</span>
              )}
            </label>
          ))}
        </div>
        {mutation.isError && (
          <p role="alert">Could not create the Data Block. Your choices are retained.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !name.trim()}
            onClick={() => {
              mutation.mutate();
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
