import { type ReactNode, useState } from 'react';
import { CopyMinus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { sqlTable } from '@/api';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { useBuilderSql } from '../builder/useBuilderSql';
import { BuilderToolCard } from '../builder/BuilderToolCard';
import type { BuilderInput } from '../builder/builderTypes';
import { buildDedupeBodies } from './dedupeModel';

/**
 * Data Builder tool (issue 151): keeps the first of each duplicate and saves
 * every duplicate group in a second Data Block, so nothing is lost.
 */
export function DedupeSubTab({
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
  // null compares every column.
  const [compare, setCompare] = useState<string[] | null>(null);
  const [nearText, setNearText] = useState(false);
  const [ignoreLinks, setIgnoreLinks] = useState(false);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');

  const count = useBuilderSql(
    workspaceId,
    input?.id ?? null,
    input ? `SELECT COUNT(*) AS n FROM ${sqlTable(input.id)}` : null,
  );
  const counted = count.data?.rows[0]?.n;
  const sourceRows = counted === undefined || counted === null ? null : Number(counted);
  const columns = input?.columns ?? [];
  const bodies = input ? buildDedupeBodies(input, { compare, nearText, ignoreLinks, name }) : null;
  const shown = columns.filter((column) =>
    column.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const base = name.trim() || (input?.name ?? 'data');

  return (
    <BuilderToolCard
      title="Remove duplicates"
      icon={<CopyMinus className="h-5 w-5" />}
      helpKey="preprocessing.dedupe.tab"
      helpLabel="Remove duplicates overview"
      tooltip="Keep the first of each duplicate, and save every duplicate group in a second Data Block."
      renderNodeInputsPanel={renderNodeInputsPanel}
      workspaceId={workspaceId}
      sourceNodeId={input?.id ?? null}
      operation="deduplicate"
      previewBody={bodies?.kept ?? null}
      incompleteMessage="Choose at least one column to compare."
      nameLabel="Name the new data blocks"
      name={name}
      namePlaceholder={input?.name ?? ''}
      onNameChange={setName}
      createLabel="Create 2 Data Blocks"
      canCreate={bodies !== null}
      onCreate={async () => {
        if (!bodies) throw new Error('Choose at least one column to compare.');
        await createDerivedNode(bodies.kept);
        await createDerivedNode(bodies.duplicates);
        return `Created ${base}_deduplicated and ${base}_duplicates.`;
      }}
      summary={(total) => {
        if (total === null || total === undefined) return null;
        if (sourceRows === null) return `${total.toLocaleString()} rows kept.`;
        const removed = sourceRows - total;
        return removed === 0
          ? 'No duplicates found.'
          : `Removes ${removed.toLocaleString()} duplicate row${removed === 1 ? '' : 's'}; ${total.toLocaleString()} rows kept.`;
      }}
      previewTitle="Preview the deduplicated rows"
      previewDescription={`Creates ${base}_deduplicated (the first of each duplicate, in the original order) and ${base}_duplicates (every duplicate group, with "duplicate_group" and "kept" columns).`}
      onAlert={onAlert}
    >
      <fieldset className="space-y-2">
        <legend className="text-body font-medium">Rows are duplicates when they match on</legend>
        <label className="flex items-center gap-2 text-body">
          <input
            type="radio"
            name="dedupe-compare"
            checked={compare === null}
            onChange={() => {
              setCompare(null);
            }}
          />
          Every column
        </label>
        <label className="flex items-center gap-2 text-body">
          <input
            type="radio"
            name="dedupe-compare"
            checked={compare !== null}
            onChange={() => {
              setCompare([]);
            }}
          />
          Chosen columns
        </label>
        {compare !== null ? (
          <div className="ml-6 space-y-1">
            {columns.length > 8 ? (
              <Input
                aria-label="Find a column to compare"
                placeholder="Find a column"
                value={filter}
                className="h-7 w-48"
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
              />
            ) : null}
            <ul className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
              {shown.map((column) => (
                <li key={column.name}>
                  <label className="flex min-w-0 items-center gap-2 text-body">
                    <Checkbox
                      checked={compare.includes(column.name)}
                      onCheckedChange={(checked) => {
                        setCompare(
                          checked === true
                            ? [...compare, column.name]
                            : compare.filter((item) => item !== column.name),
                        );
                      }}
                    />
                    <span className="truncate">{column.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-body">
          <Checkbox
            checked={nearText}
            disabled={!input?.column}
            onCheckedChange={(checked) => {
              setNearText(checked === true);
            }}
          />
          Match near-duplicate text in “{input?.column ?? 'the text column'}”
        </label>
        <p className="ml-6 text-label-secondary text-description">
          Texts match when they are the same after ignoring case, spacing, and punctuation.
        </p>
        {nearText ? (
          <label className="ml-6 flex items-center gap-2 text-body">
            <Checkbox
              checked={ignoreLinks}
              onCheckedChange={(checked) => {
                setIgnoreLinks(checked === true);
              }}
            />
            Also ignore web links and @mentions (for “RT @user:” re-posts)
          </label>
        ) : null}
      </div>
    </BuilderToolCard>
  );
}
