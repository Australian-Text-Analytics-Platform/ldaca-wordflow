import { type ReactNode, useState } from 'react';
import { Split } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { BuilderToolCard } from '../builder/BuilderToolCard';
import type { BuilderInput } from '../builder/builderTypes';
import { useBuilderSql } from '../builder/useBuilderSql';
import {
  type DateGrouping,
  type Grouping,
  MAX_GROUPS,
  defaultGrouping,
  groupBlockName,
  groupCountSql,
  rangeSql,
  toGroups,
} from './splitGroups';

const DATE_OPTIONS: { value: DateGrouping; label: string }[] = [
  { value: 'year', label: 'Year' },
  { value: 'year_month', label: 'Year and month' },
  { value: 'date', label: 'Day' },
];

/**
 * Data Builder tool (issue 149): one Filter-derived Data Block per ticked
 * value, date period, or number range of a column.
 */
export function SplitByGroupSubTab({
  input,
  workspaceId,
  renderNodeInputsPanel,
  onAlert,
}: {
  input: BuilderInput | null;
  workspaceId: string | null;
  renderNodeInputsPanel?: () => ReactNode;
  onAlert: (message: string) => void;
}) {
  const { createDerivedNode } = useWorkspaceActions();
  const [column, setColumn] = useState('');
  const [dateBy, setDateBy] = useState<DateGrouping>('year');
  const [numberMode, setNumberMode] = useState<'interval' | 'bins'>('interval');
  const [start, setStart] = useState('0');
  const [size, setSize] = useState('10');
  const [binCount, setBinCount] = useState('5');
  // Unticked groups; everything else is ticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');

  const columnInfo = input?.columns.find((item) => item.name === column);
  const kind = columnInfo?.kind ?? 'text';
  const range = useBuilderSql(
    workspaceId,
    input?.id ?? null,
    input && column && kind === 'number' && numberMode === 'bins'
      ? rangeSql(input.id, column)
      : null,
  );
  const low = Number(range.data?.rows[0]?.low);
  const high = Number(range.data?.rows[0]?.high);

  let grouping: Grouping | null = column ? defaultGrouping(kind) : null;
  if (grouping?.kind === 'dates') grouping = { kind: 'dates', by: dateBy };
  if (kind === 'number') {
    grouping =
      numberMode === 'interval'
        ? { kind: 'interval', start: Number(start), size: Number(size) }
        : Number.isFinite(low) && Number.isFinite(high) && Number(binCount) >= 1
          ? { kind: 'bins', count: Math.floor(Number(binCount)), low, high }
          : null;
  }
  const sql = input && column && grouping ? groupCountSql(input.id, column, grouping) : null;
  const counts = useBuilderSql(workspaceId, input?.id ?? null, sql);
  const groups = grouping && counts.data ? toGroups(column, grouping, counts.data.rows) : [];
  const tooMany = groups.length > MAX_GROUPS;
  const ticked = tooMany ? [] : groups.filter((group) => !unticked.has(group.key));
  const prefix = name.trim() || (input?.name ?? 'data');
  const firstBody =
    input && ticked[0]
      ? {
          kind: 'filter' as const,
          source_node_id: input.id,
          conditions: ticked[0].conditions,
          logic: 'and' as const,
        }
      : null;

  const resetTicks = () => {
    setUnticked(new Set());
  };

  return (
    <BuilderToolCard
      title="Split by group"
      icon={<Split className="h-5 w-5" />}
      helpKey="preprocessing.split-group.tab"
      helpLabel="Split by group overview"
      tooltip="Make one Data Block per value, date period, or number range of a column."
      renderNodeInputsPanel={renderNodeInputsPanel}
      workspaceId={workspaceId}
      sourceNodeId={input?.id ?? null}
      operation="split-group"
      previewBody={firstBody}
      incompleteMessage={
        !column
          ? 'Choose the column to split by.'
          : tooMany
            ? `More than ${String(MAX_GROUPS)} groups: narrow the data first, for example with Filter.`
            : 'Tick at least one group.'
      }
      nameLabel="Name prefix"
      name={name}
      namePlaceholder={input?.name ?? ''}
      onNameChange={setName}
      createLabel={`Create ${String(ticked.length)} Data Block${ticked.length === 1 ? '' : 's'}`}
      canCreate={ticked.length > 0}
      onCreate={async () => {
        if (!input) throw new Error('Select a data block first.');
        for (const group of ticked) {
          await createDerivedNode({
            kind: 'filter',
            source_node_id: input.id,
            conditions: group.conditions,
            logic: 'and',
            name: groupBlockName(prefix, group.label),
          });
        }
        return `Created ${String(ticked.length)} Data Block${ticked.length === 1 ? '' : 's'}.`;
      }}
      previewTitle={ticked[0] ? `Preview: ${groupBlockName(prefix, ticked[0].label)}` : 'Preview'}
      previewDescription="The first ticked group. Each group becomes a Filter-derived Data Block."
      onAlert={onAlert}
    >
      <div className="space-y-1">
        <span className="text-body font-medium">Split by</span>
        <SearchableSelect
          options={(input?.columns ?? [])
            .filter((item) => item.kind !== 'other')
            .map((item) => ({ value: item.name }))}
          value={column}
          onChange={(next) => {
            setColumn(next);
            resetTicks();
          }}
          placeholder="Choose a column"
          ariaLabel="Split by column"
          triggerClassName="w-64"
        />
      </div>

      {column && kind === 'date' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-body">One Data Block per</span>
          {DATE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-body">
              <input
                type="radio"
                name="split-date"
                checked={dateBy === option.value}
                onChange={() => {
                  setDateBy(option.value);
                  resetTicks();
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}

      {column && kind === 'number' ? (
        <div className="space-y-2">
          <label className="flex flex-wrap items-center gap-2 text-body">
            <input
              type="radio"
              name="split-number"
              checked={numberMode === 'interval'}
              onChange={() => {
                setNumberMode('interval');
                resetTicks();
              }}
            />
            Ranges starting at
            <Input
              aria-label="Start value"
              type="number"
              value={start}
              className="h-7 w-24"
              onChange={(event) => {
                setStart(event.target.value);
                setNumberMode('interval');
                resetTicks();
              }}
            />
            of size
            <Input
              aria-label="Range size"
              type="number"
              min={0}
              value={size}
              className="h-7 w-24"
              onChange={(event) => {
                setSize(event.target.value);
                setNumberMode('interval');
                resetTicks();
              }}
            />
          </label>
          <label className="flex flex-wrap items-center gap-2 text-body">
            <input
              type="radio"
              name="split-number"
              checked={numberMode === 'bins'}
              onChange={() => {
                setNumberMode('bins');
                resetTicks();
              }}
            />
            Split the full range into
            <Input
              aria-label="Number of ranges"
              type="number"
              min={1}
              max={MAX_GROUPS}
              value={binCount}
              className="h-7 w-20"
              onChange={(event) => {
                setBinCount(event.target.value);
                setNumberMode('bins');
                resetTicks();
              }}
            />
            equal ranges
          </label>
        </div>
      ) : null}

      {column && groups.length > 0 && !tooMany ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label>
              Groups ({ticked.length} of {groups.length} ticked)
            </Label>
            <div className="flex gap-2 text-label-secondary">
              <button type="button" className="underline" onClick={resetTicks}>
                Tick all
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setUnticked(new Set(groups.map((group) => group.key)));
                }}
              >
                Untick all
              </button>
            </div>
          </div>
          <ul className="max-h-72 divide-y divide-surface-border overflow-y-auto rounded-md border border-surface-border">
            {groups.map((group) => (
              <li key={group.key}>
                <label className="flex items-center gap-2 px-2 py-1 text-body">
                  <Checkbox
                    checked={!unticked.has(group.key)}
                    onCheckedChange={(checked) => {
                      const next = new Set(unticked);
                      if (checked === true) next.delete(group.key);
                      else next.add(group.key);
                      setUnticked(next);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate" title={group.label}>
                    {group.label}
                  </span>
                  <span className="text-label-secondary text-description">
                    {group.rows.toLocaleString()} row{group.rows === 1 ? '' : 's'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tooMany ? (
        <p className="text-body text-error">
          This column has more than {MAX_GROUPS} groups. Narrow the data first (for example with
          Filter), or use wider date periods or ranges.
        </p>
      ) : null}
      {counts.error ? (
        <p className="text-body text-error">Could not count the groups: {counts.error.message}</p>
      ) : null}
    </BuilderToolCard>
  );
}
