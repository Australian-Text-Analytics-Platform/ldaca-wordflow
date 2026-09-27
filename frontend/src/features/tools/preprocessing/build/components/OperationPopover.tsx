import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  applyBuildOperation,
  operationDefinition,
  operationDefaults,
  operationKinds,
  type BuildChain,
  type BuildOperation,
  type BuildOperationKind,
} from '../operations';

interface OperationPopoverProps {
  chain: BuildChain | null;
  operation?: BuildOperation;
  onSelect: (operation: BuildOperation) => void;
  disabled?: boolean;
  children: ReactNode;
}

/** The same parameter form adds a step or edits an existing chip. */
export function OperationPopover({
  chain,
  operation,
  onSelect,
  disabled,
  children,
}: OperationPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<BuildOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const definition = draft ? operationDefinition(draft.kind) : null;
  const parameters = chain ? (definition?.parameters?.(chain.type) ?? []) : [];
  const groups = Map.groupBy(
    operationKinds.filter((kind) => {
      const def = operationDefinition(kind);
      return (
        chain &&
        def.accepts(chain.type) &&
        `${def.label} ${def.group}`.toLowerCase().includes(search.toLowerCase())
      );
    }),
    (kind) => operationDefinition(kind).group,
  );
  function confirm(next: BuildOperation) {
    if (!chain) return;
    try {
      applyBuildOperation(chain, next);
      onSelect(next);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  function choose(kind: BuildOperationKind) {
    if (!chain) return;
    const next = operationDefaults(kind, chain.type);
    setError(null);
    if (operationDefinition(kind).parameters) setDraft(next);
    else confirm(next);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch('');
        setDraft(operation ?? null);
        setError(null);
      }}
    >
      <PopoverTrigger asChild disabled={Boolean(disabled) || !chain}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col p-3"
        align="start"
        sideOffset={8}
      >
        {draft && definition ? (
          <form
            className="min-h-0 space-y-3 overflow-y-auto"
            onSubmit={(event) => {
              event.preventDefault();
              confirm(draft);
            }}
          >
            <p className="font-medium">{definition.label}</p>
            {definition.description && (
              <p className="text-body text-description">{definition.description}</p>
            )}
            {parameters.map((parameter) => (
              <label key={parameter.name} className="block space-y-1 text-body">
                <span>{parameter.label}</span>
                {parameter.options ? (
                  <Select
                    value={draft.arguments[parameter.name] ?? ''}
                    onValueChange={(value) => {
                      setDraft({
                        ...draft,
                        arguments: { ...draft.arguments, [parameter.name]: value },
                      });
                    }}
                  >
                    <SelectTrigger aria-label={parameter.label}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {parameter.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={draft.arguments[parameter.name] ?? ''}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        arguments: { ...draft.arguments, [parameter.name]: event.target.value },
                      });
                    }}
                  />
                )}
              </label>
            ))}
            {error && (
              <p role="alert" className="text-body text-error">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (operation) setOpen(false);
                  else setDraft(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {operation ? 'Save operation' : 'Add operation'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Input
              aria-label="Search operations"
              placeholder="Search operations…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
            {chain?.summarized && (
              <p className="mt-2 text-body text-description">
                One column summary per chain. Further scalar operations remain available.
              </p>
            )}
            <div className="mt-2 min-h-0 overflow-y-auto">
              {[...groups].map(([group, kinds]) => (
                <section key={group} className="mb-3">
                  <h4 className="px-2 py-1 text-label-secondary font-semibold text-description">
                    {group}
                  </h4>
                  {kinds.map((kind) => {
                    const def = operationDefinition(kind);
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={Boolean(def.summary && chain?.summarized)}
                        title={def.description}
                        onClick={() => {
                          choose(kind);
                        }}
                        className="block w-full rounded px-2 py-1.5 text-left text-body hover:bg-list-hover focus-visible:bg-list-hover disabled:opacity-40"
                      >
                        {def.label}
                      </button>
                    );
                  })}
                </section>
              ))}
              {!groups.size && (
                <p className="p-2 text-body text-description">No matching operations</p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
