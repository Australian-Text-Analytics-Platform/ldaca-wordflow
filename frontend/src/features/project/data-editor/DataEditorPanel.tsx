import { acceptPlaceholderOnTab } from '@/features/tools/common/placeholderTabFill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OperationError } from '@/features/project/OperationError';
import { changeColumn, querySql, type ProjectNode } from '@/features/project/api';
import { objectSql, sameTarget, targetLabel, type DataTarget } from '@/features/project/objects';
import { schemaQuery } from '@/features/project/projectQueries';
import { useProjectPreview, type EditorSession } from '@/features/project/previewState';
import { usePreprocessingPreview } from '@/features/tools/preprocessing/hooks/usePreprocessingPreview';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import {
  CLEAN_OPERATIONS,
  compileEditor,
  EDITOR_TOOLS,
  suggestedEditorName,
  type EditorDraft,
  type EditorTool,
} from './expressions';

export function EditorToolbar({ target, column }: { target: DataTarget; column: string }) {
  const edit = useProjectPreview((state) => state.edit);
  return (
    <div
      aria-label="Data Editor tools"
      className="flex flex-wrap items-center gap-1 border-b border-surface-border p-1"
    >
      <span className="px-1 text-label-secondary font-medium">Editor</span>
      {(Object.entries(EDITOR_TOOLS) as [EditorTool, string][]).map(([tool, label]) => (
        <Button
          key={tool}
          size="sm"
          variant="ghost"
          disabled={!column}
          onClick={() => edit(target, tool, column)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-body">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Choice({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-body">
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
const selectStyle = 'min-w-0 rounded-md border border-surface-border bg-surface p-2 text-body';

export function DataEditorPanel({
  base,
  session,
  nodes,
}: {
  base: string;
  session: EditorSession;
  nodes: ProjectNode[];
}) {
  const { target, tool, draft } = session;
  const node = nodes.find((node) => sameTarget(node.object ?? node.table_name, target));
  const schema = useQuery({ ...schemaQuery(base, target), meta: { reportError: false } });
  const columns = schema.data?.map((column) => column.name) ?? [];
  const update = (patch: Partial<EditorDraft>) =>
    useProjectPreview.getState().updateEditor({ ...draft, ...patch });
  const [error, setError] = useState<unknown>();
  const submitted = useRef(false);
  const [delimiter, setDelimiter] = useState('');
  const suggested = suggestedEditorName(tool, draft, columns);
  let operation: ReturnType<typeof compileEditor> | undefined;
  let incomplete = '';
  try {
    operation = compileEditor(tool, draft, columns, node?.kind === 'table');
  } catch (error) {
    incomplete = error instanceof Error ? error.message : String(error);
  }
  const stats = usePreprocessingPreview({
    request: operation ? { changed: operation.changed, invalid: operation.invalidXml } : null,
    identity: {
      projectBase: base,
      operation: `editor-stats-${tool}`,
      nodeIds: [typeof target === 'string' ? target : target.name],
    },
    reportError: false,
    debounceMs: 350,
    fetcher: async ({ request, signal }) => {
      const data = await querySql(
        base,
        [
          {
            sql: `WITH __wf_current AS (SELECT * FROM ${objectSql(target)}) SELECT count(*) AS total, count(*) FILTER (WHERE ${request.changed}) AS changed, count(*) FILTER (WHERE ${request.invalid ?? 'FALSE'}) AS malformed FROM __wf_current`,
          },
        ],
        signal,
      );
      return { data: Array.from(data), columns: [], pagination: null };
    },
  });
  const mutation = useMutation({
    meta: { reportError: false },
    mutationFn: (captured: ReturnType<typeof compileEditor>) =>
      changeColumn(base, target, captured.change),
  });
  const apply = async () => {
    if (!operation || submitted.current) return;
    submitted.current = true;
    setError(undefined);
    try {
      await mutation.mutateAsync(operation);
      if (useProjectPreview.getState().editor === session)
        useProjectPreview.getState().closeEditor();
    } catch (error) {
      setError(error);
    } finally {
      submitted.current = false;
    }
  };
  const find =
    tool === 'replace' || tool === 'extract' || (tool === 'count' && draft.measure === 'matches');
  const newName =
    !['delete', 'split'].includes(tool) &&
    ((tool !== 'replace' && tool !== 'clean') || draft.newColumn);
  const addDelimiter = () => {
    if (delimiter && !draft.delimiters.includes(delimiter))
      update({ delimiters: [...draft.delimiters, delimiter] });
    setDelimiter('');
  };
  const stat = stats.data[0];
  return (
    <section aria-label="Data Editor" className="h-full overflow-auto p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading-2 font-semibold">{EDITOR_TOOLS[tool]}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => useProjectPreview.getState().closeEditor()}
        >
          Close
        </Button>
      </div>
      <p className="mb-3 break-words text-body text-description">{targetLabel(target)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <fieldset disabled={mutation.isPending} className="flex flex-col gap-3">
          {tool !== 'combine' && tool !== 'delete' && (
            <Field label="Column">
              <select
                aria-label="Editor column"
                className={selectStyle}
                value={draft.column}
                onChange={(event) => update({ column: event.target.value, output: '' })}
              >
                <option value="">Choose a column</option>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {find && (
            <>
              <Field label={draft.regex ? 'Pattern' : 'Find text'}>
                <Input
                  value={draft.pattern}
                  onChange={(event) => update({ pattern: event.target.value })}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Choice
                  label="Regex"
                  checked={draft.regex}
                  onChange={(regex) => update({ regex })}
                />
                <Choice
                  label="Whole word (literal)"
                  disabled={draft.regex}
                  checked={draft.whole}
                  onChange={(whole) => update({ whole })}
                />
                <Choice
                  label="Ignore case"
                  checked={!draft.sensitive}
                  onChange={(ignore) => update({ sensitive: !ignore })}
                />
              </div>
            </>
          )}
          {tool === 'replace' && (
            <Field label="Replace with">
              <Input
                value={draft.replacement}
                onChange={(event) => update({ replacement: event.target.value })}
              />
            </Field>
          )}
          {(tool === 'replace' || tool === 'extract') && (
            <Choice
              label={tool === 'replace' ? 'First match only' : 'Limit matches'}
              checked={draft.first}
              onChange={(first) => update({ first })}
            />
          )}
          {tool === 'extract' && (
            <>
              {draft.first && (
                <Field label="Maximum matches">
                  <Input
                    type="number"
                    min={1}
                    value={draft.limit}
                    onChange={(event) => update({ limit: Number(event.target.value) })}
                  />
                </Field>
              )}
              <Field label="Join matches with">
                <Input
                  value={draft.connector}
                  onChange={(event) => update({ connector: event.target.value })}
                />
              </Field>
            </>
          )}
          {tool === 'combine' && (
            <>
              <Field label="Template">
                <textarea
                  className={selectStyle}
                  value={draft.template}
                  onChange={(event) => update({ template: event.target.value })}
                  placeholder="{title}: {document}"
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {columns.map((column) => (
                  <Button
                    key={column}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => update({ template: `${draft.template}{${column}}` })}
                  >{`{${column}}`}</Button>
                ))}
              </div>
              <p className="text-label-secondary text-description">
                Use {'{column}'} for a column, {'{{'} and {'}}'} for literal braces. Constant text
                is also allowed.
              </p>
              <Field label="Missing values">
                <select
                  className={selectStyle}
                  value={draft.missing}
                  onChange={(event) =>
                    update({ missing: event.target.value as EditorDraft['missing'] })
                  }
                >
                  <option value="blank">Use empty text for missing inputs</option>
                  <option value="missing">Keep the whole result missing</option>
                </select>
              </Field>
            </>
          )}
          {tool === 'clean' && (
            <Field label="Cleaning">
              <select
                className={selectStyle}
                value={draft.clean}
                onChange={(event) => update({ clean: event.target.value as EditorDraft['clean'] })}
              >
                {Object.entries(CLEAN_OPERATIONS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {tool === 'split' && (
            <>
              <Field label="Literal delimiter">
                <div className="flex gap-2">
                  <Input
                    value={delimiter}
                    onChange={(event) => setDelimiter(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addDelimiter();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addDelimiter}>
                    Add
                  </Button>
                </div>
              </Field>
              <div className="flex flex-wrap gap-1">
                {draft.delimiters.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Remove delimiter ${JSON.stringify(value)}`}
                    onClick={() =>
                      update({ delimiters: draft.delimiters.filter((item) => item !== value) })
                    }
                  >
                    {value === ' '
                      ? 'Space'
                      : value === '\t'
                        ? 'Tab'
                        : value === '\n'
                          ? 'Newline'
                          : JSON.stringify(value)}{' '}
                    ×
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => update({ delimiters: [...new Set([...draft.delimiters, ' '])] })}
                >
                  Space
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => update({ delimiters: [...new Set([...draft.delimiters, '\t'])] })}
                >
                  Tab
                </Button>
              </div>
              <Choice
                label="Also split on newlines"
                checked={draft.newlines}
                onChange={(newlines) => update({ newlines })}
              />
              <Field label="Number of columns">
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={draft.parts}
                  onChange={(event) => update({ parts: Number(event.target.value) })}
                />
              </Field>
              <Choice
                label="Split from the right"
                checked={draft.right}
                onChange={(right) => update({ right })}
              />
              <p className="text-label-secondary text-description">
                Longer delimiters match first. {draft.right ? 'The first part' : 'The final part'}{' '}
                retains the unsplit remainder.
              </p>
            </>
          )}
          {tool === 'count' && (
            <Field label="Count">
              <select
                className={selectStyle}
                value={draft.measure}
                onChange={(event) =>
                  update({ measure: event.target.value as EditorDraft['measure'], output: '' })
                }
              >
                <option value="words">Words</option>
                <option value="characters">Unicode characters</option>
                <option value="non_whitespace">Non-whitespace characters</option>
                <option value="matches">Matches</option>
              </select>
            </Field>
          )}
          {(tool === 'replace' || tool === 'clean') && (
            <Choice
              label="Write to a new column"
              checked={draft.newColumn}
              onChange={(newColumn) => update({ newColumn })}
            />
          )}
          {newName && (
            <Field label="New column name">
              <Input
                value={draft.output}
                placeholder={suggested}
                onChange={(event) => update({ output: event.target.value })}
                onKeyDown={(event) =>
                  acceptPlaceholderOnTab({
                    event,
                    value: draft.output,
                    setValue: (output) => update({ output }),
                  })
                }
              />
            </Field>
          )}
          {tool === 'delete' && (
            <>
              <p className="text-body">
                {node?.kind === 'table'
                  ? 'This permanently deletes the selected Table columns and their values.'
                  : 'The selected columns are removed together. Undo restores this View layer.'}
              </p>
              {columns.map((column) => (
                <Choice
                  key={column}
                  label={column}
                  checked={draft.deleted.includes(column)}
                  onChange={(checked) =>
                    update({
                      deleted: checked
                        ? [...draft.deleted, column]
                        : draft.deleted.filter((item) => item !== column),
                    })
                  }
                />
              ))}
            </>
          )}
          {incomplete && <p className="text-body text-description">{incomplete}</p>}
          {stat && !stats.outdated && (
            <p role="status" className="text-body">
              {String(stat.changed)} of {String(stat.total)} rows affected.
              {Number(stat.malformed) > 0
                ? ` ${String(stat.malformed)} malformed XML rows retained.`
                : ''}
            </p>
          )}
          {operation?.invalidXml && (
            <div className="space-y-1">
              <Choice
                label="Show malformed XML rows only"
                checked={draft.malformedOnly}
                onChange={(malformedOnly) => update({ malformedOnly })}
              />
              <p className="text-description">
                This filters the preview only. Apply cleans all valid rows and retains malformed
                rows.
              </p>
            </div>
          )}
          {(schema.error || stats.error) && (
            <OperationError
              title="Couldn't preview edit"
              error={schema.error ?? stats.error}
              onRetry={stats.refresh}
            />
          )}
          {error != null && (
            <OperationError
              title="Couldn't apply edit"
              error={error}
              onRetry={() => {
                void apply();
              }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!operation || mutation.isPending}>
              {mutation.isPending ? 'Applying…' : 'Apply'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => useProjectPreview.getState().closeEditor()}
            >
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
