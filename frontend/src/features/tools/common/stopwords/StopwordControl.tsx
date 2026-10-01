import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import * as projectApi from '@/features/project/api';
import { mapArrowColumnsToInfo } from '@/features/project/data-view/utils/columnTypes';
import * as objectsApi from '@/features/project/objects';
import { schemaQuery } from '@/features/project/projectQueries';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { NodeInputsPanel } from '../components/NodeInputsPanel';
import { mergeStopwords } from '../language/stopwords';
import { useNodeInputs } from '../nodeInputs/useNodeInputs';
import { StopwordPresets } from './StopwordPresets';
import { saveStopwords, stopwordQuery, type StopwordSource } from './stopwordData';
import type { useStopwords } from './useStopwords';

export function StopwordControl({
  base,
  nodes,
  selected,
  enabled,
  disabled,
  controller,
  onSelect,
  onEnabledChange,
}: {
  base: string;
  nodes: projectApi.ProjectNode[];
  selected: StopwordSource | null;
  enabled: boolean;
  disabled: boolean;
  controller: ReturnType<typeof useStopwords>;
  onSelect: (selected: StopwordSource | null) => Promise<void>;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const id = useId();
  const select = useMutation({ mutationFn: onSelect });
  const savedKey = JSON.stringify(selected);
  const [draft, setDraft] = useState<{ savedKey: string; value: StopwordSource | null } | null>(
    null,
  );
  const choice = draft?.savedKey === savedKey ? draft.value : selected;
  const choosing = Boolean(choice && !choice.column);
  const sourceSchema = choice?.source.schema ?? '';
  const sourceName = choice?.source.name ?? '';
  const schema = useQuery({
    ...schemaQuery(base, { schema: sourceSchema, name: sourceName }),
    enabled: Boolean(choice?.source.schema && choice.source.name),
  });
  const node = nodes.find((node) =>
    objectsApi.sameTarget(node.object ?? node.table_name, choice?.source ?? null),
  );
  const appliedNode = nodes.find((item) =>
    objectsApi.sameTarget(item.object ?? item.table_name, selected?.source ?? null),
  );
  const unavailable = choice !== null && (!node || node.kind === 'missing');
  const busy = controller.create.isPending || controller.edit.isPending;
  const picker = useNodeInputs({
    value: choice ? [{ node_id: choice.source.name, column: choice.column }] : [],
    onChange: (next) => {
      const input = next[0];
      const nextChoice = input
        ? {
            source:
              choice?.source.name === input.node_id
                ? choice.source
                : { schema: 'data', name: input.node_id },
            column: input.column ?? '',
          }
        : null;
      setDraft({ savedKey, value: nextChoice });
      if (nextChoice === null || nextChoice.column) select.mutate(nextChoice);
    },
    allNodes: nodes
      .filter((node) => node.kind !== 'missing')
      .map((node) => ({
        id: node.table_name,
        name: node.label ?? node.table_name,
        color: node.color,
        document: null,
        tokenizerModel: null,
      })),
    getColumnInfos: (node) =>
      node.id === choice?.source.name ? mapArrowColumnsToInfo(schema.data ?? []) : [],
    constraints: { maxNodes: 1 },
  });
  return (
    <section
      aria-label="Stopwords"
      className="min-w-0 space-y-2 border-y border-surface-border py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${id}-enabled`} className="text-body font-semibold">
          Stopwords
        </Label>
        <Switch
          id={`${id}-enabled`}
          aria-label="Filter stopwords from results"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {enabled && (
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <div className="min-w-0 flex-[1_1_16rem] space-y-2">
            {selected && !choosing && choice && (
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setDraft({ savedKey, value: null });
                }}
              >
                Replace stopword list
              </Button>
            )}
            {!choice && selected && draft?.savedKey === savedKey && (
              <p role="status" className="text-description">
                Choose the replacement Data Block and stopword column. The previous applied words
                are unchanged.
              </p>
            )}
            <NodeInputsPanel
              {...picker}

              title="Stopword Data Block"
              maxNodes={1}
              columnLabel="Stopword column"
              disabled={disabled}
              resolvedNodes={picker.resolvedNodes.map((resolved) => ({
                ...resolved,
                // Saved choices remain explicit, including a missing or unchosen column.
                column: choice?.column ?? '',
              }))}
              unavailableNodes={
                choice && unavailable
                  ? [
                      {
                        id: choice.source.name,
                        name: choice.source.name,
                        column: choice.column,
                      },
                    ]
                  : []
              }
              onAddNodes={picker.addNodes}
              onRemoveNode={picker.removeNode}
              onClear={picker.clear}
              onColumnChange={picker.setColumn}
            />
            {choice && (unavailable || choosing) && (
              <p className="break-words text-body-secondary text-description" role="status">
                {unavailable
                  ? 'This Data Block is unavailable. Choose another list or disconnect it.'
                  : 'Choose the stopword column. The previous applied words are unchanged.'}
              </p>
            )}
            {(schema.isError || controller.words.isError) && (
              <div className="text-body-secondary text-description" role="alert">
                <span>{(schema.error ?? controller.words.error)?.message}</span>{' '}
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    void schema.refetch();
                    if (selected?.column) void controller.words.refetch();
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || busy}
                onClick={() => {
                  controller.create.mutate();
                }}
              >
                {controller.create.isPending ? 'Creating…' : 'Create empty'}
              </Button>
            </div>
            {controller.edit.isPending && (
              <p role="status" className="text-body-secondary text-description">
                Preparing editor…
              </p>
            )}
          </div>
          <div className="min-w-0 flex-[2_1_20rem]">
            {selected?.column ? (
              <StopwordEditor
                key={JSON.stringify(selected)}
                base={base}
                target={selected}
                inputs={controller.inputs}
                disabled={disabled}
                readOnly={appliedNode?.kind !== 'table'}
                onCreateCopy={
                  appliedNode?.kind === 'view'
                    ? () => {
                        controller.edit.mutate();
                      }
                    : undefined
                }
                copying={busy}
              />
            ) : (
              <p className="text-body-secondary text-description">
                Choose a Data Block and column, or create an empty list to add words.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function StopwordEditor({
  base,
  target,
  inputs,
  disabled = false,
  readOnly = false,
  onCreateCopy,
  copying = false,
}: {
  base: string;
  target: StopwordSource;
  inputs: StopwordSource[];
  disabled?: boolean;
  readOnly?: boolean;
  onCreateCopy?: () => void;
  copying?: boolean;
}) {
  const id = useId();
  const list = useQuery(stopwordQuery(base, target));
  const [entry, setEntry] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState(false);
  const [clearing, setClearing] = useState(false);
  const current = list.data ?? [];
  const save = useMutation({
    mutationFn: ({
      before = [],
      after = [],
      sort = false,
    }: {
      before?: string[];
      after?: string[];
      sort?: boolean;
    }) => saveStopwords(base, target, before, after, sort),
    onSuccess: async () => {
      await list.refetch();
    },
  });
  const blocked = disabled || readOnly || save.isPending || list.isFetching || list.isError;
  function addEntry(text = entry) {
    const incoming = mergeStopwords(text, []);
    if (!incoming.length) return;
    setEntry(text);
    save.mutate(
      { after: incoming },
      {
        onSuccess: () => {
          setEntry('');
          input.current?.focus();
        },
      },
    );
  }
  return (
    <div aria-label="Stopword editor" className="min-w-0 space-y-2">
      <p className="break-words text-description text-body-secondary">
        {target.source.name} · {target.column}.
        {readOnly
          ? ' Read-only list.'
          : ' Changes update this shared list for every analysis using it.'}
      </p>
      {readOnly && onCreateCopy && (
        <div className="space-y-2">
          <p className="text-description text-body-secondary">
            Create a new Table to edit these words. The original View stays unchanged.
          </p>
          <Button variant="outline" size="sm" disabled={disabled || copying} onClick={onCreateCopy}>
            {copying ? 'Creating…' : 'Create editable copy'}
          </Button>
        </div>
      )}
      <div className="min-h-0 space-y-2 overflow-y-auto">
        <Label htmlFor={id}>Stopwords</Label>
        <div
          role="group"
          aria-label="Stopword bubbles"
          className="flex min-h-48 max-h-72 min-w-0 flex-wrap content-start items-center gap-1.5 overflow-y-auto rounded-md border border-input-border bg-editor p-2 focus-within:border-focus"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              input.current?.focus();
            }
          }}
        >
          {current.map((word) => (
            <Tag key={word.toLowerCase()} tone="neutral" className="max-w-full whitespace-normal">
              <span className="min-w-0 break-all">{word}</span>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove stopword ${word}`}
                  title={`Remove ${word}`}
                  className="shrink-0 rounded-full p-0.5 hover:bg-panel focus-visible:outline focus-visible:outline-focus disabled:opacity-50"
                  disabled={blocked}
                  onClick={() => {
                    save.mutate({ before: [word] });
                    input.current?.focus();
                  }}
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </Tag>
          ))}
          {!readOnly && (
            <Input
              ref={input}
              id={id}
              aria-label="Add stopword"
              aria-describedby={`${id}-hint`}
              className="min-w-32 flex-1 border-0 bg-transparent focus-visible:outline-none"
              placeholder="Type a word…"
              value={entry}
              disabled={blocked}
              onChange={(event) => {
                setEntry(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addEntry();
                }
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text');
                if (!/[,\r\n]/.test(pasted)) return;
                event.preventDefault();
                const { selectionStart, selectionEnd } = event.currentTarget;
                const text =
                  entry.slice(0, selectionStart ?? entry.length) +
                  pasted +
                  entry.slice(selectionEnd ?? entry.length);
                addEntry(text);
              }}
            />
          )}
        </div>
        {!readOnly && (
          <p id={`${id}-hint`} className="text-body-secondary text-description">
            Type a word and press Enter. Paste comma- or newline-separated words to add several.
          </p>
        )}
        <p role="status" className="text-body-secondary text-description">
          {list.isFetching ? 'Updating stopwords… ' : ''}
          {current.length.toLocaleString()} {current.length === 1 ? 'word' : 'words'}
        </p>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={blocked}
              onClick={() => {
                setPresets(true);
              }}
            >
              Add language preset…
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={blocked}
              onClick={() => {
                save.mutate({ sort: true });
              }}
            >
              Sort
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={blocked}
              onClick={() => {
                setClearing(true);
              }}
            >
              Clear words
            </Button>
          </div>
        )}
        {list.isError && (
          <p role="status">
            The list is outdated.{' '}
            <Button
              variant="link"
              onClick={() => {
                void list.refetch();
              }}
            >
              Retry
            </Button>
          </p>
        )}
      </div>
      <AlertDialog open={clearing} onOpenChange={setClearing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all stopwords?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the displayed words from the shared Table for every analysis using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={blocked}
              onClick={() => {
                save.mutate({ before: current });
              }}
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {presets && (
        <StopwordPresets
          base={base}
          sources={inputs}
          disabled={blocked}
          onClose={() => {
            setPresets(false);
          }}
          onAdd={async (incoming) => {
            await save.mutateAsync({ after: incoming });
            setPresets(false);
          }}
        />
      )}
    </div>
  );
}
