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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

export function TopicPublishDialog({
  base,
  id,
  summary,
  initial,
  onClose,
}: {
  base: string;
  id: string;
  summary: api.TopicSummary;
  initial: api.TopicPublish;
  onClose: () => void;
}) {
  const [request, setRequest] = useState(() => structuredClone(initial));
  const [selected, setSelected] = useState(summary.sources.map(() => true));
  const [sync, setSync] = useState(false);
  const mutation = useMutation({
    mutationFn: (captured: api.TopicPublish) => api.publishTopicModel(base, id, captured),
    onSuccess: onClose,
  });
  const changeColumn = (index: number, column: string, checked: boolean) => {
    setRequest((old) => ({
      ...old,
      sources: old.sources.map((source, i) =>
        i === index ||
        (sync && selected[i] && summary.sources[i]?.columns.some(([name]) => name === column))
          ? {
              ...source,
              columns: checked
                ? [...new Set([...source.columns, column])]
                : source.columns.filter((name) => name !== column),
            }
          : source,
      ),
    }));
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Topic Modelling to Project</DialogTitle>
          <DialogDescription>
            Create independent annotated Tables and one complete topic dictionary. No selected
            topics includes all retained rows; selected topics include the union of positive Top-N
            memberships.
          </DialogDescription>
        </DialogHeader>
        <p className="text-description">
          {request.topic_count} topics · Top {request.top_n} ·{' '}
          {request.selected_topics.length
            ? `Selected: ${request.selected_topics.join(', ')}`
            : 'All retained rows'}
          . Lasso, search and zoom do not restrict publication.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setRequest((old) => ({
                ...old,
                sources: old.sources.map((s, i) =>
                  selected[i]
                    ? {
                        ...s,
                        columns: summary.sources[i]?.columns.map(([name]) => name) ?? [],
                        coverage: true,
                      }
                    : s,
                ),
              }));
            }}
          >
            Select all columns
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRequest((old) => ({
                ...old,
                sources: old.sources.map((s, i) =>
                  selected[i] ? { ...s, columns: [], coverage: false } : s,
                ),
              }));
            }}
          >
            Select none
          </Button>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={sync}
              onCheckedChange={(value) => {
                setSync(value === true);
                if (value) {
                  const columns = new Set(
                    request.sources.filter((_, i) => selected[i]).flatMap((s) => s.columns),
                  );
                  setRequest((old) => ({
                    ...old,
                    sources: old.sources.map((s, i) =>
                      selected[i]
                        ? {
                            ...s,
                            columns:
                              summary.sources[i]?.columns
                                .map(([name]) => name)
                                .filter((name) => columns.has(name)) ?? [],
                          }
                        : s,
                    ),
                  }));
                }
              }}
            />
            Sync columns
          </label>
        </div>
        {request.sources.map((output, i) => (
          <fieldset key={i} className="space-y-2 rounded-md border p-3">
            <legend className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selected[i] ?? false}
                onCheckedChange={(value) => {
                  setSelected((old) => old.map((v, j) => (i === j ? value === true : v)));
                }}
              />
              {summary.sources[i]?.input.source.name}
            </legend>
            <label>
              Output name
              <Input
                value={output.name}
                disabled={!selected[i]}
                onChange={(e) => {
                  setRequest((old) => ({
                    ...old,
                    sources: old.sources.map((s, j) =>
                      i === j ? { ...s, name: e.target.value } : s,
                    ),
                  }));
                }}
              />
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked disabled />
              Dominant topic · TOPIC_top1 (required)
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={output.coverage}
                disabled={!selected[i]}
                onCheckedChange={(value) => {
                  setRequest((old) => ({
                    ...old,
                    sources: old.sources.map((s, j) =>
                      i === j || (sync && selected[j]) ? { ...s, coverage: value === true } : s,
                    ),
                  }));
                }}
              />
              Full topic coverage
            </label>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {summary.sources[i]?.columns.map(([column]) => (
                <label key={column} className="flex items-center gap-2 break-all">
                  <Checkbox
                    checked={output.columns.includes(column)}
                    disabled={!selected[i]}
                    onCheckedChange={(value) => {
                      changeColumn(i, column, value === true);
                    }}
                  />
                  {column}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label>
          Topic dictionary name
          <Input
            value={request.dictionary_name}
            onChange={(e) => {
              setRequest((old) => ({ ...old, dictionary_name: e.target.value }));
            }}
          />
        </label>
        {mutation.isError && (
          <p role="alert">Could not create the Data Blocks. Your choices are retained.</p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              !selected.some(Boolean) ||
              !request.dictionary_name.trim() ||
              request.sources.some((source, i) => selected[i] && !source.name.trim())
            }
            onClick={() => {
              mutation.mutate({
                ...request,
                sources: request.sources.filter((_, i) => selected[i]),
              });
            }}
          >
            {mutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
