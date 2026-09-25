import { type ReactNode, useState } from 'react';
import { Scissors } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { BuilderToolCard } from '../builder/BuilderToolCard';
import type { BuilderInput } from '../builder/builderTypes';
import { buildSegmentBody, type LeadMode, type SegmentUnit } from './segmentModel';

const UNITS: { value: SegmentUnit; label: string; hint: string }[] = [
  { value: 'sentence', label: 'Sentences', hint: 'Ends at . ! ? or … followed by a space.' },
  { value: 'paragraph', label: 'Paragraphs', hint: 'Separated by a blank line.' },
  { value: 'line', label: 'Lines', hint: 'Every line break starts a new segment.' },
  {
    value: 'pattern',
    label: 'A pattern',
    hint: 'A regular expression marking where each segment starts.',
  },
];

/**
 * Data Builder tool (issue 148): one row per sentence, paragraph, line, or
 * pattern-led segment, such as "SPEAKER:" turns in a transcript.
 */
export function SegmentSubTab({
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
  const [unit, setUnit] = useState<SegmentUnit>('sentence');
  const [pattern, setPattern] = useState('');
  const [lead, setLead] = useState<LeadMode>('column');
  const [leadColumn, setLeadColumn] = useState('speaker');
  const [name, setName] = useState('');

  const body = input ? buildSegmentBody(input, { unit, pattern, lead, leadColumn, name }) : null;
  const leadClash =
    unit === 'pattern' &&
    lead === 'column' &&
    input?.columns.some((column) => column.name === leadColumn.trim());

  return (
    <BuilderToolCard
      title="Segment"
      icon={<Scissors className="h-5 w-5" />}
      helpKey="preprocessing.segment.tab"
      helpLabel="Segment overview"
      tooltip="Make a new Data Block with one row per sentence, paragraph, line, or pattern-led segment."
      renderNodeInputsPanel={renderNodeInputsPanel}
      workspaceId={workspaceId}
      sourceNodeId={input?.id ?? null}
      operation="segment"
      previewBody={body}
      incompleteMessage={
        !input?.column
          ? 'Choose the text column in the inputs panel.'
          : unit === 'pattern' && !pattern
            ? 'Enter the pattern that starts each segment.'
            : 'Name the column for the matched text with a new name.'
      }
      name={name}
      namePlaceholder={input ? `${input.name}_${unit}s` : ''}
      onNameChange={setName}
      createLabel="Create Data Block"
      canCreate={body !== null}
      onCreate={async () => {
        if (!body) throw new Error('Complete the settings first.');
        const created = await createDerivedNode(body);
        return `Created ${created.name}.`;
      }}
      summary={(total) =>
        total === null || total === undefined
          ? null
          : `${total.toLocaleString()} segment row${total === 1 ? '' : 's'}.`
      }
      previewTitle="Preview segments"
      previewDescription='Each segment keeps its source row’s other columns; "segment" counts from 1 within each row.'
      onAlert={onAlert}
    >
      <fieldset className="space-y-1">
        <legend className="text-body font-medium">
          Split {input?.column ? `“${input.column}”` : 'the text column'} into
        </legend>
        {UNITS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-body">
            <input
              type="radio"
              name="segment-unit"
              checked={unit === option.value}
              onChange={() => {
                setUnit(option.value);
              }}
            />
            {option.label}
            <span className="text-description">{option.hint}</span>
          </label>
        ))}
      </fieldset>
      {unit === 'pattern' ? (
        <div className="space-y-3 rounded-md border border-surface-border p-3">
          <div className="space-y-1">
            <Label htmlFor="segment-pattern">Each segment starts with</Label>
            <Input
              id="segment-pattern"
              value={pattern}
              placeholder="e.g. ^[\w\s]+:"
              className="font-mono"
              spellCheck={false}
              onChange={(event) => {
                setPattern(event.target.value);
              }}
            />
            <p className="text-label-secondary text-description">
              A regular expression; ^ is the start of a line. Text before the first match becomes
              segment 1.
            </p>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-body font-medium">The matched text</legend>
            <label className="flex items-center gap-2 text-body">
              <input
                type="radio"
                name="segment-lead"
                checked={lead === 'column'}
                onChange={() => {
                  setLead('column');
                }}
              />
              Goes into its own column
            </label>
            {lead === 'column' ? (
              <Input
                aria-label="Column for the matched text"
                aria-invalid={leadClash}
                value={leadColumn}
                className="ml-6 w-auto"
                onChange={(event) => {
                  setLeadColumn(event.target.value);
                }}
              />
            ) : null}
            <label className="flex items-center gap-2 text-body">
              <input
                type="radio"
                name="segment-lead"
                checked={lead === 'drop'}
                onChange={() => {
                  setLead('drop');
                }}
              />
              Is dropped, like a delimiter
            </label>
          </fieldset>
        </div>
      ) : null}
    </BuilderToolCard>
  );
}
