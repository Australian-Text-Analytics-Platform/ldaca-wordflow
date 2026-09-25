import { type ReactNode, useState } from 'react';
import { Sigma, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { BuilderToolCard } from '../builder/BuilderToolCard';
import type { BuilderInput } from '../builder/builderTypes';
import {
  buildGroupSummaryBody,
  defaultSummary,
  SUMMARIES_BY_KIND,
  type Summary,
} from './groupSummaryModel';

const SUMMARY_LABELS: Record<Summary, string> = {
  leave: 'Leave out',
  join_text: 'Join text',
  count_distinct: 'Count distinct',
  distinct_values: 'Distinct values',
  first: 'First',
  last: 'Last',
  sum: 'Sum',
  mean: 'Mean',
  min: 'Minimum',
  max: 'Maximum',
  earliest: 'Earliest',
  latest: 'Latest',
  earliest_latest: 'Earliest & latest',
};

const SEPARATORS = [
  { value: '\n\n', label: 'A blank line' },
  { value: '\n', label: 'A new line' },
  { value: ' ', label: 'A space' },
  { value: '; ', label: 'A semicolon' },
] as const;

/** Data Builder tool (issue 150): one row per group, with per-column summaries. */
export function GroupSummarySubTab({
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
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, Summary>>({});
  const [separator, setSeparator] = useState<string>('\n\n');
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');

  const columns = input?.columns ?? [];
  const body = input ? buildGroupSummaryBody(input, { groupBy, choices, separator, name }) : null;
  const summarised = columns.filter(
    (column) =>
      !groupBy.includes(column.name) &&
      column.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const joins =
    body?.kind === 'group_summary' &&
    body.summaries?.some((item) => ['join_text', 'distinct_values'].includes(item.summary));

  return (
    <BuilderToolCard
      title="Aggregate"
      subtitle="One row per group, such as one document per speaker, with each column summarised."
      icon={<Sigma className="h-5 w-5" />}
      helpKey="preprocessing.summarise.tab"
      helpLabel="Aggregate overview"
      tooltip="Make a new Data Block with one row per group, such as one document per speaker."
      renderNodeInputsPanel={renderNodeInputsPanel}
      workspaceId={workspaceId}
      sourceNodeId={input?.id ?? null}
      operation="group-summary"
      previewBody={body}
      incompleteMessage="Choose at least one column to group by."
      name={name}
      namePlaceholder={input && groupBy.length ? `${input.name}_by_${groupBy.join('_')}` : ''}
      onNameChange={setName}
      createLabel="Create Data Block"
      canCreate={body !== null}
      onCreate={async () => {
        if (!body) throw new Error('Choose at least one column to group by.');
        const created = await createDerivedNode(body);
        return `Created ${created.name}.`;
      }}
      summary={(total) =>
        total === null || total === undefined
          ? null
          : `${total.toLocaleString()} group${total === 1 ? '' : 's'}, each with a "rows" count.`
      }
      previewTitle="Preview groups"
      previewDescription="One row per group, in the order each group first appears."
      onAlert={onAlert}
    >
      <div className="space-y-1">
        <span className="text-body font-medium">Group by</span>
        <div className="flex flex-wrap items-center gap-2">
          {groupBy.map((column) => (
            <span
              key={column}
              className="inline-flex items-center gap-1 rounded-sm border border-surface-border px-1.5 py-0.5 text-body"
            >
              {column}
              <button
                type="button"
                aria-label={`Stop grouping by ${column}`}
                onClick={() => {
                  setGroupBy(groupBy.filter((item) => item !== column));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <SearchableSelect
            options={columns
              .filter((column) => !groupBy.includes(column.name))
              .map((column) => ({ value: column.name }))}
            value=""
            onChange={(column) => {
              setGroupBy([...groupBy, column]);
            }}
            placeholder={groupBy.length ? 'Add a column' : 'Choose a column'}
            ariaLabel="Group by column"
            triggerClassName="w-56"
          />
        </div>
      </div>

      {groupBy.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body font-medium">Summarise the other columns</span>
            {columns.length > 8 ? (
              <Input
                aria-label="Find a column to summarise"
                placeholder="Find a column"
                value={filter}
                className="h-7 w-48"
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
              />
            ) : null}
          </div>
          <ul className="max-h-72 divide-y divide-surface-border overflow-y-auto rounded-md border border-surface-border">
            {summarised.map((column) => {
              const value = choices[column.name] ?? defaultSummary(column, input?.column ?? '');
              return (
                <li key={column.name} className="flex items-center gap-3 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-body" title={column.name}>
                    {column.name}
                    <span className="ml-2 text-label-secondary text-description">
                      {column.kind}
                    </span>
                  </span>
                  <Select
                    value={value}
                    onValueChange={(next) => {
                      setChoices({ ...choices, [column.name]: next as Summary });
                    }}
                  >
                    <SelectTrigger className="h-7 w-44" aria-label={`Summary of ${column.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUMMARIES_BY_KIND[column.kind].map((summary) => (
                        <SelectItem key={summary} value={summary}>
                          {SUMMARY_LABELS[summary]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
          {joins ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="summarise-separator">Put between joined texts</Label>
              <Select value={separator} onValueChange={setSeparator}>
                <SelectTrigger id="summarise-separator" className="h-7 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEPARATORS.map((option) => (
                    <SelectItem key={option.label} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}
    </BuilderToolCard>
  );
}
