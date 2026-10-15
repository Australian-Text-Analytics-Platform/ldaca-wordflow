import { OperationError } from '@/features/project/OperationError';
import { GeneratedFieldHint } from '../common/components/GeneratedFieldHint';
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
import { cachedDataBlockNames, suggestDataBlockNames } from '@/features/project/automaticNames';
import * as concordanceApi from '@/features/tools/concordance/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
const generated = [
  ['left_context', 'Left context'],
  ['matched_text', 'Match'],
  ['right_context', 'Right context'],
  ['start_idx', 'Start'],
  ['end_idx', 'End'],
  ['l1', 'L1'],
  ['r1', 'R1'],
  ['l1_frequency', 'L1 frequency'],
  ['r1_frequency', 'R1 frequency'],
  ['extraction', 'Extraction'],
] as const;
export function ConcordancePublishDialog({
  base,
  result: initialResult,
  projection,
  filters,
  sources,
  onClose,
}: {
  base: string;
  result: concordanceApi.ConcordanceAnalysisResult;
  projection: 'matches' | 'documents';
  filters: concordanceApi.ConcordanceFilter[];
  sources?: { input: concordanceApi.ConcordanceRequest['inputs'][number]; columns: string[] }[];
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [result] = useState(initialResult);
  const corpora =
    sources ??
    result.result.payload.corpora.map((corpus) => ({
      input: corpus.input,
      columns: corpus.columns.map(([name]) => name),
    }));
  const [selected, setSelected] = useState(corpora.map(() => true));
  const [outputs, setOutputs] = useState<concordanceApi.ConcordancePublishSource[]>(() => {
    const names = suggestDataBlockNames(
      corpora.map((corpus) => ({
        sources: [corpus.input.source.name],
        operation: projection === 'documents' ? 'cc_doc' : 'cc',
      })),
      cachedDataBlockNames(cache, base),
    );
    return names.map(({ name }, index) => ({
      source_index: index,
      name,
      metadata: [],
      fields: generated.map(([field]) => field),
      filter: filters[index] ?? { excluded_terms: [], uncased: false, bins: [], bin_count: 20 },
    }));
  });
  const [sync, setSync] = useState(false);
  const mutation = useMutation({
    meta: { reportError: false },
    mutationFn: (captured: concordanceApi.ConcordancePublishSource[]) =>
      concordanceApi.publishConcordance(base, result.id, projection, captured),
    onSuccess: onClose,
  });
  const common =
    corpora
      .filter((_, index) => selected[index])
      .reduce<string[] | null>(
        (previous, corpus) =>
          previous === null
            ? corpus.columns
            : previous.filter((column) => corpus.columns.includes(column)),
        null,
      ) ?? [];
  const update = (index: number, key: 'metadata' | 'fields', value: string, checked: boolean) => {
    setOutputs((old) =>
      old.map((output, other) => {
        if (
          other !== index &&
          (!sync || !selected[other] || (key === 'metadata' && !common.includes(value)))
        )
          return output;
        return {
          ...output,
          [key]: checked
            ? [...new Set([...output[key], value])]
            : output[key].filter((item) => item !== value),
        };
      }),
    );
  };
  const reserved = new Set(
    generated.map(([field]) =>
      `CONC_${field === 'l1_frequency' ? 'l1_freq' : field === 'r1_frequency' ? 'r1_freq' : field}`.toLowerCase(),
    ),
  );
  const all = (checked: boolean) => {
    setOutputs((old) =>
      old.map((output, index) =>
        selected[index]
          ? {
              ...output,
              metadata: checked
                ? (corpora[index]?.columns ?? [])
                    .map((column) => column)
                    .filter(
                      (column) =>
                        column !== corpora[index]?.input.column &&
                        !reserved.has(column.toLowerCase()),
                    )
                : [],
              fields: checked ? generated.map(([field]) => field) : [],
            }
          : output,
      ),
    );
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
          <DialogTitle>Add {projection} to Project</DialogTitle>
          <DialogDescription>
            Create independent Data Blocks from the saved result. All matching rows are included,
            across pages. Existing objects are never overwritten.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              all(true);
            }}
          >
            Select all columns
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              all(false);
            }}
          >
            Select none
          </Button>
          {selected.filter(Boolean).length > 1 && (
            <label className="flex items-center gap-2">
              <Checkbox
                checked={sync}
                onCheckedChange={(value) => {
                  setSync(value === true);
                  if (value) {
                    const union = [
                      ...new Set(
                        outputs
                          .filter((_, index) => selected[index])
                          .flatMap((output) => output.metadata),
                      ),
                    ].filter((column) => common.includes(column));
                    const fields = [
                      ...new Set(
                        outputs
                          .filter((_, index) => selected[index])
                          .flatMap((output) => output.fields),
                      ),
                    ];
                    setOutputs((old) =>
                      old.map((output, index) =>
                        selected[index]
                          ? {
                              ...output,
                              metadata: [
                                ...new Set([
                                  ...output.metadata.filter((column) => !common.includes(column)),
                                  ...union,
                                ]),
                              ],
                              fields,
                            }
                          : output,
                      ),
                    );
                  }
                }}
              />
              Sync columns
            </label>
          )}
        </div>
        {outputs.map((output, index) => {
          const corpus = corpora[index];
          if (!corpus) return null;
          return (
            <section key={index} className="space-y-3 border-t border-surface-border pt-3">
              <label className="flex items-center gap-2 font-semibold">
                <Checkbox
                  checked={selected[index]}
                  onCheckedChange={(value) => {
                    setSelected((old) =>
                      old.map((item, i) => (i === index ? value === true : item)),
                    );
                    setSync(false);
                  }}
                />
                {corpus.input.source.name}
              </label>
              {selected[index] && (
                <>
                  <label className="block space-y-1">
                    <span>Data Block name</span>
                    <Input
                      value={output.name}
                      onChange={(event) => {
                        setOutputs((old) =>
                          old.map((item, i) =>
                            i === index ? { ...item, name: event.target.value } : item,
                          ),
                        );
                      }}
                    />
                  </label>
                  <p className="text-description">
                    Required: {corpus.input.column}
                    {projection === 'documents' ? ' and CONC_extraction' : ''}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {corpus.columns
                      .filter((column) => column !== corpus.input.column)
                      .map((column) => (
                        <label className="flex items-center gap-2" key={column}>
                          <Checkbox
                            checked={output.metadata.includes(column)}
                            disabled={reserved.has(column.toLowerCase())}
                            onCheckedChange={(value) => {
                              update(index, 'metadata', column, value === true);
                            }}
                          />
                          {column}
                        </label>
                      ))}
                  </div>
                  {projection === 'matches' && (
                    <div className="flex flex-wrap gap-3">
                      {generated.map(([field, label]) => (
                        <label key={field} className="flex items-center gap-2">
                          <Checkbox
                            aria-label={label}
                            checked={output.fields.includes(field)}
                            onCheckedChange={(value) => {
                              update(index, 'fields', field, value === true);
                            }}
                          />
                          <span>
                            {label}
                            <GeneratedFieldHint field={field} />
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
        {mutation.isError && (
          <OperationError error={mutation.error} title="Couldn't create Data Blocks" />
        )}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              !selected.some(Boolean) ||
              outputs.some((output, index) => selected[index] && !output.name.trim())
            }
            onClick={() => {
              mutation.mutate(outputs.filter((_, index) => selected[index]));
            }}
          >
            {mutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
