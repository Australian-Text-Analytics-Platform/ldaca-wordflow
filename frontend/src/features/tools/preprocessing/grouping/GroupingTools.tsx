import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createViews, querySql } from '@/features/project/api';
import { acceptPlaceholderOnTab } from '@/features/tools/common/placeholderTabFill';
import { uniqueColumnName } from '@/features/project/data-editor/expressions';
import { OperationError } from '@/features/project/OperationError';
import { objectDependencies } from '@/features/project/projectChanges';
import {
  isArrowFloatField,
  isArrowIntegerField,
  isArrowTemporalField,
  type ArrowColumn,
} from '@/lib/arrow/decodeArrowTable';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { PreviewTable } from '../components/PreviewTable';
import { usePreprocessingPreview } from '../hooks/usePreprocessingPreview';
import { previewSql, resultSelect, type Transformation } from '../projectPreprocessing';
import {
  aggregateOperation,
  deduplicateOperations,
  groupCountSql,
  groupExpression,
  groupSelect,
  SUMMARIES,
  summaryOptions,
  type Grouping,
  type Normalisation,
  type Summary,
} from './sql';

interface Props {
  base: string;
  source: string;
  columns: ArrowColumn[];
  existingNames: string[];
  active: boolean;
  inputs: ReactNode;
  suggested: string;
  documentColumn?: string;
}
const selectStyle = 'min-w-0 rounded-md border border-surface-border bg-surface p-2 text-body';
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-body">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-body">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/** All outputs pass to the native atomic View owner in one request. */
function useApply(base: string) {
  const submitted = useRef(false);
  const [error, setError] = useState<unknown>();
  const [created, setCreated] = useState<string[]>([]);
  const mutation = useMutation({
    meta: { reportError: false },
    mutationFn: (outputs: { name: string; operation: Transformation }[]) =>
      createViews(
        base,
        outputs.map(({ name, operation }) => ({
          name,
          sql: resultSelect(operation),
          mappings: operation.mappings,
          computed_columns: operation.computedColumns,
        })),
      ),
  });
  return {
    pending: mutation.isPending,
    error,
    created,
    apply: async (outputs: { name: string; operation: Transformation }[]) => {
      if (submitted.current) return;
      submitted.current = true;
      setError(undefined);
      setCreated([]);
      try {
        setCreated(await mutation.mutateAsync(outputs));
      } catch (error) {
        setError(error);
      } finally {
        submitted.current = false;
      }
    },
  };
}
function Outcome({ state, retry }: { state: ReturnType<typeof useApply>; retry: () => void }) {
  return (
    <>
      {state.error != null && (
        <OperationError title="Couldn't create Data Blocks" error={state.error} onRetry={retry} />
      )}
      {state.created.length > 0 && (
        <p role="status" className="text-body">
          Created {state.created.join(', ')}.
        </p>
      )}
    </>
  );
}
function OutputName({
  value,
  suggested,
  onChange,
}: {
  value: string;
  suggested: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="New Data Block name">
      <Input
        value={value}
        placeholder={suggested}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => acceptPlaceholderOnTab({ event, value, setValue: onChange })}
      />
    </Field>
  );
}
function ToolPreview({
  base,
  source,
  select,
  active,
  description,
}: {
  base: string;
  source: string;
  select: string | null;
  active: boolean;
  description: string;
}) {
  const preview = usePreprocessingPreview({
    request: select,
    identity: { projectBase: base, operation: 'builder-grouping', nodeIds: [source] },
    enabled: active,
    reportError: false,
    retainLastSuccess: true,
    fetcher: ({ request, page, pageSize, signal }) =>
      previewSql(base, request, page, pageSize, signal),
  });
  return (
    <PreviewTable
      title="Preview"
      description={description}
      {...preview}
      loadingBadge={
        preview.outdated ? (
          <span className="text-description">
            Previous preview — waiting for the current settings.
          </span>
        ) : undefined
      }
      onPageChange={preview.setPage}
      onPageSizeChange={preview.setPageSize}
    />
  );
}

export function GroupTool(props: Props) {
  const { base, source, columns, existingNames, active } = props;
  const [column, setColumn] = useState(columns[0]?.name ?? '');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<{ column: string; grouping: Grouping } | null>(null);
  const field = columns.find((item) => item.name === column)?.field;
  const grouping: Grouping =
    draft?.column === column
      ? draft.grouping
      : field && isArrowTemporalField(field)
        ? { kind: 'dates', period: 'year' }
        : field && (isArrowIntegerField(field) || isArrowFloatField(field))
          ? { kind: 'ranges', start: '0', width: '10' }
          : { kind: 'values' };
  let expression = '';
  let invalid = '';
  try {
    if (field) expression = groupExpression(column, grouping, field);
  } catch (error) {
    invalid = error instanceof Error ? error.message : String(error);
  }
  const counts = useQuery({
    queryKey: ['native', base, 'group-counts', source, expression, grouping],
    enabled: active && Boolean(expression),
    meta: { ...objectDependencies(source), reportError: false },
    queryFn: async ({ signal }) => {
      const result = await querySql(
        base,
        [{ sql: groupCountSql(source, expression, grouping) }],
        signal,
      );
      return Array.from(result, (row) => ({
        value: row.value as string | null,
        label: (row.label ?? row.value) as string | null,
        rows: String(row.rows),
      }));
    },
  });
  const identity = JSON.stringify([source, expression]);
  const [selection, setSelection] = useState<{ identity: string; excluded: (string | null)[] }>({
    identity,
    excluded: [],
  });
  const excluded = selection.identity === identity ? selection.excluded : [];
  const groups = counts.data ?? [];
  const chosen = groups.filter((group) => !excluded.includes(group.value));
  const [previewChoice, setPreviewChoice] = useState<{
    identity: string;
    value: string | null;
  } | null>(null);
  const previewGroup =
    previewChoice?.identity === identity &&
    groups.some((group) => group.value === previewChoice.value)
      ? previewChoice.value
      : groups[0]?.value;
  const state = useApply(base);
  const tooMany = groups.length > 50;
  const apply = () => {
    if (tooMany || !chosen.length || !expression || counts.isFetching) return;
    const reserved = [...existingNames];
    const outputs = chosen.map((group) => {
      const nameValue = uniqueColumnName(
        `${name.trim() || source} · ${group.label ?? '(empty)'}`,
        reserved,
      );
      reserved.push(nameValue);
      return {
        name: nameValue,
        operation: {
          select: groupSelect(source, expression, group.value),
          mappings: columns.map((item) => ({ source, column: item.name, output: item.name })),
        },
      };
    });
    void state.apply(outputs);
  };
  const updateGrouping = (grouping: Grouping) => setDraft({ column, grouping });
  return (
    <div className="space-y-4">
      {props.inputs}
      <fieldset disabled={state.pending} className="flex flex-col gap-3">
        <Field label="Group column">
          <select
            className={selectStyle}
            value={column}
            onChange={(event) => setColumn(event.target.value)}
          >
            <option value="">Choose a column</option>
            {columns.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Grouping">
          <select
            className={selectStyle}
            value={grouping.kind}
            onChange={(event) =>
              updateGrouping(
                event.target.value === 'dates'
                  ? { kind: 'dates', period: 'year' }
                  : event.target.value === 'ranges'
                    ? { kind: 'ranges', start: '0', width: '10' }
                    : { kind: 'values' },
              )
            }
          >
            <option value="values">Selected values</option>
            {field && isArrowTemporalField(field) && <option value="dates">Date periods</option>}
            {field && (isArrowIntegerField(field) || isArrowFloatField(field)) && (
              <option value="ranges">Numeric ranges</option>
            )}
          </select>
        </Field>
        {grouping.kind === 'dates' && (
          <Field label="Date period">
            <select
              className={selectStyle}
              value={grouping.period}
              onChange={(event) =>
                updateGrouping({
                  kind: 'dates',
                  period: event.target.value as 'year' | 'month' | 'day',
                })
              }
            >
              <option value="year">Year</option>
              <option value="month">Month</option>
              <option value="day">Day</option>
            </select>
          </Field>
        )}
        {grouping.kind === 'ranges' && (
          <div className="flex flex-wrap gap-2">
            <Field label="Range origin">
              <Input
                value={grouping.start}
                onChange={(event) => updateGrouping({ ...grouping, start: event.target.value })}
              />
            </Field>
            <Field label="Range width">
              <Input
                value={grouping.width}
                onChange={(event) => updateGrouping({ ...grouping, width: event.target.value })}
              />
            </Field>
          </div>
        )}
        <Field label="Output name prefix">
          <Input
            value={name}
            placeholder={source}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {invalid && <p className="text-body">{invalid}</p>}
        {counts.error && (
          <OperationError
            title="Couldn't count groups"
            error={counts.error}
            onRetry={() => {
              void counts.refetch();
            }}
          />
        )}
        {tooMany ? (
          <p role="status" className="text-body">
            More than 50 groups. Narrow the source or choose wider periods or ranges before creating
            Data Blocks.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <Check
                key={JSON.stringify(group.value)}
                label={`${group.label ?? '(empty)'} — ${group.rows} rows`}
                checked={!excluded.includes(group.value)}
                onChange={(checked) =>
                  setSelection({
                    identity,
                    excluded: checked
                      ? excluded.filter((value) => value !== group.value)
                      : [...excluded, group.value],
                  })
                }
              />
            ))}
          </div>
        )}
        <Button
          onClick={apply}
          disabled={!chosen.length || tooMany || state.pending || counts.isFetching}
        >
          Create {chosen.length || ''} Data Blocks
        </Button>
      </fieldset>
      <Outcome state={state} retry={apply} />
      {groups.length > 0 && !tooMany && (
        <Field label="Preview group">
          <select
            className={selectStyle}
            value={JSON.stringify(previewGroup)}
            onChange={(event) =>
              setPreviewChoice({ identity, value: JSON.parse(event.target.value) as string | null })
            }
          >
            {groups.map((group) => (
              <option key={JSON.stringify(group.value)} value={JSON.stringify(group.value)}>
                {group.label ?? '(empty)'}
              </option>
            ))}
          </select>
        </Field>
      )}
      <ToolPreview
        base={base}
        source={source}
        select={
          expression && previewGroup !== undefined && !tooMany
            ? groupSelect(source, expression, previewGroup)
            : null
        }
        active={active}
        description="Each selected group becomes a live View. Missing, empty and blank text share one empty group."
      />
    </div>
  );
}

export function AggregateTool(props: Props) {
  const [keys, setKeys] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, Summary>>({});
  const [separator, setSeparator] = useState(' ');
  const [name, setName] = useState('');
  const [sort, setSort] = useState('');
  const [descending, setDescending] = useState(false);
  const state = useApply(props.base);
  const selectedSummaries = Object.fromEntries(
    props.columns.map((column) => [
      column.name,
      choices[column.name] ??
        (column.name === props.documentColumn && summaryOptions(column.field).includes('join_text')
          ? 'join_text'
          : isArrowTemporalField(column.field)
            ? 'earliest_latest'
            : 'leave'),
    ]),
  );
  let operation: Transformation | undefined;
  let invalid = '';
  try {
    operation = aggregateOperation(
      props.source,
      props.columns,
      keys,
      selectedSummaries,
      separator,
      sort ? { column: sort, descending } : undefined,
    );
  } catch (error) {
    invalid = error instanceof Error ? error.message : String(error);
  }
  const apply = () => {
    if (operation) void state.apply([{ name: name.trim() || props.suggested, operation }]);
  };
  return (
    <div className="space-y-4">
      {props.inputs}
      <fieldset disabled={state.pending} className="flex flex-col gap-3">
        <p className="text-body">Group by</p>
        {props.columns.map((column) => (
          <Check
            key={column.name}
            label={column.name}
            checked={keys.includes(column.name)}
            onChange={(checked) =>
              setKeys(checked ? [...keys, column.name] : keys.filter((key) => key !== column.name))
            }
          />
        ))}
        {props.columns
          .filter((column) => !keys.includes(column.name))
          .map((column) => (
            <Field key={column.name} label={`Summary of ${column.name}`}>
              <select
                className={selectStyle}
                value={selectedSummaries[column.name]}
                onChange={(event) =>
                  setChoices({ ...choices, [column.name]: event.target.value as Summary })
                }
              >
                {summaryOptions(column.field).map((summary) => (
                  <option key={summary} value={summary}>
                    {SUMMARIES[summary]}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        <Field label="Join separator">
          <Input value={separator} onChange={(event) => setSeparator(event.target.value)} />
        </Field>
        <Field label="Order First, Last and joined text">
          <select
            className={selectStyle}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="">Incoming order</option>
            {props.columns.map((column) => (
              <option key={column.name}>{column.name}</option>
            ))}
          </select>
        </Field>
        {sort && <Check label="Descending" checked={descending} onChange={setDescending} />}
        <p className="text-label-secondary text-description">
          Every output includes a row count. Count distinct excludes missing values.
        </p>
        <OutputName value={name} suggested={props.suggested} onChange={setName} />
        {invalid && <p className="text-body">{invalid}</p>}
        <Button onClick={apply} disabled={!operation || state.pending}>
          Create Data Block
        </Button>
      </fieldset>
      <Outcome state={state} retry={apply} />
      <ToolPreview
        base={props.base}
        source={props.source}
        select={operation?.select ?? null}
        active={props.active}
        description="Selected summaries produce one row per group."
      />
    </div>
  );
}

export function DeduplicateTool(props: Props) {
  const [keys, setKeys] = useState<string[]>(props.columns[0] ? [props.columns[0].name] : []);
  const [name, setName] = useState('');
  const [normalisation, setNormalisation] = useState<Normalisation>({
    urls: false,
    punctuation: false,
    symbols: false,
    whitespace: false,
    ignoreCase: false,
  });
  const [preview, setPreview] = useState<'kept' | 'duplicates'>('kept');
  const state = useApply(props.base);
  let operations: ReturnType<typeof deduplicateOperations> | undefined;
  let invalid = '';
  try {
    operations = deduplicateOperations(props.source, props.columns, keys, normalisation);
  } catch (error) {
    invalid = error instanceof Error ? error.message : String(error);
  }
  const reserved = [...props.existingNames];
  const firstName = uniqueColumnName(`${name.trim() || props.source}_deduplicated`, reserved);
  reserved.push(firstName);
  const duplicatesName = uniqueColumnName(`${name.trim() || props.source}_duplicates`, reserved);
  const apply = () => {
    if (operations)
      void state.apply([
        { name: firstName, operation: operations.kept },
        { name: duplicatesName, operation: operations.duplicates },
      ]);
  };
  return (
    <div className="space-y-4">
      {props.inputs}
      <fieldset disabled={state.pending} className="flex flex-col gap-3">
        <p className="text-body">Compare columns</p>
        {props.columns.map((column) => (
          <Check
            key={column.name}
            label={column.name}
            checked={keys.includes(column.name)}
            onChange={(checked) =>
              setKeys(checked ? [...keys, column.name] : keys.filter((key) => key !== column.name))
            }
          />
        ))}
        <p className="text-body">Optional text normalisation</p>
        {(
          Object.entries({
            urls: 'Remove URLs',
            punctuation: 'Remove punctuation',
            symbols: 'Remove symbols',
            whitespace: 'Remove whitespace',
            ignoreCase: 'Ignore case',
          }) as [keyof Normalisation, string][]
        ).map(([key, label]) => (
          <Check
            key={key}
            label={label}
            checked={normalisation[key]}
            onChange={(checked) => setNormalisation({ ...normalisation, [key]: checked })}
          />
        ))}
        <Field label="Output name prefix">
          <Input
            value={name}
            placeholder={props.source}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <p className="text-body">
          Creates {firstName} with first occurrences, and {duplicatesName} with every
          duplicate-group member and a {operations?.keptColumn ?? 'kept'} flag. Original rows stay
          unchanged.
        </p>
        {invalid && <p className="text-body">{invalid}</p>}
        <Button onClick={apply} disabled={!operations || state.pending}>
          Create both Data Blocks
        </Button>
      </fieldset>
      <Outcome state={state} retry={apply} />
      <Field label="Preview output">
        <select
          className={selectStyle}
          value={preview}
          onChange={(event) => setPreview(event.target.value as 'kept' | 'duplicates')}
        >
          <option value="kept">First occurrences</option>
          <option value="duplicates">All duplicate-group members</option>
        </select>
      </Field>
      <ToolPreview
        base={props.base}
        source={props.source}
        select={operations?.[preview].select ?? null}
        active={props.active}
        description="Matching uses the chosen columns; normalisation changes comparison keys only."
      />
    </div>
  );
}
