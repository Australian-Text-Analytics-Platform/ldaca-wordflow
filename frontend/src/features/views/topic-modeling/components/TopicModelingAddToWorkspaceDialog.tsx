import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AddToWorkspaceDialog,
  type AddToWorkspaceSelection,
  type AddToWorkspaceSource,
} from '../../common/components/AddToWorkspaceDialog';
import { isUngrouped } from '../ungrouped';

export interface TopicModelingAddToWorkspaceSource {
  id: string;
  name: string;
  columns: string[];
  documentColumn: string;
}

export type TopicModelingAddToWorkspaceSelection = AddToWorkspaceSelection;

/** How detached rows are formed: one per document, or one per (document, topic). */
export type TopicModelingDetachRowUnit = 'documents' | 'topics';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: TopicModelingAddToWorkspaceSource[];
  /** Selected topic ids, or null when every topic is included. */
  selectedTopicIds: readonly number[] | null;
  isSubmitting: boolean;
  onSubmit: (
    sources: TopicModelingAddToWorkspaceSelection[],
    rowUnit: TopicModelingDetachRowUnit,
  ) => void;
}

const PER_TOPIC_COLUMNS = ['TOPIC_topic', 'TOPIC_share', 'TOPIC_segment_count'];
// Columns an earlier Topic Modelling added. The new ones replace them, so the
// dialog does not offer the old copies (issue 246).
const PREVIOUS_TOPIC_COLUMNS: ReadonlySet<string> = new Set([
  ...PER_TOPIC_COLUMNS,
  'TOPIC_top1',
  'TOPIC_coverage',
  'TOPIC_topic_meaning',
  'TOPIC_topic_coverage',
]);
const sourceColumns = (source: TopicModelingAddToWorkspaceSource): string[] =>
  source.columns.filter((column) => !PREVIOUS_TOPIC_COLUMNS.has(column));

/** Topic numbers listed in a default block name before it falls back to a count. */
const MAX_TOPICS_IN_NAME = 3;

/**
 * "topic 5", "topics 3, 5", or "8 topics" for a selection; "topics" for all
 * topics (issue 170).
 */
const topicNamePart = (selectedTopicIds: readonly number[] | null): string => {
  if (!selectedTopicIds || selectedTopicIds.length === 0) return 'topics';
  const ids = [...selectedTopicIds].sort((a, b) => a - b);
  // Ungrouped (-1) is named, not numbered (issue 362).
  const named = ids.map((id) => (isUngrouped(id) ? 'ungrouped' : String(id)));
  if (ids.length === 1) return isUngrouped(ids[0] ?? 0) ? 'ungrouped' : `topic ${named[0] ?? ''}`;
  if (ids.length <= MAX_TOPICS_IN_NAME) return `topics ${named.join(', ')}`;
  return `${String(ids.length)} topics`;
};

const createDialogSource = (
  source: TopicModelingAddToWorkspaceSource,
  rowUnit: TopicModelingDetachRowUnit,
  selectedTopicIds: readonly number[] | null,
): AddToWorkspaceSource => {
  const topics = topicNamePart(selectedTopicIds);
  if (rowUnit === 'topics') {
    return {
      id: source.id,
      name: source.name,
      defaultName:
        topics === 'topics' ? `${source.name} topic segments` : `${source.name} ${topics} segments`,
      columns: [
        ...PER_TOPIC_COLUMNS.map((name) => ({
          name,
          required: true,
          includeInSubmission: false,
          title: 'The topic, its share of the document and its segment count are always included.',
        })),
        ...sourceColumns(source).map((column) =>
          column === source.documentColumn
            ? {
                name: column,
                required: true,
                title: "Holds only the topic's segments, so it is always included.",
              }
            : { name: column },
        ),
      ],
    };
  }
  return {
    id: source.id,
    name: source.name,
    defaultName: `${source.name} ${topics}`,
    columns: [
      {
        name: 'TOPIC_top1',
        required: true,
        includeInSubmission: false,
        title: 'The dominant topic assignment is always included.',
      },
      ...sourceColumns(source).map((column) => ({
        name: column,
        defaultSelected: column === source.documentColumn,
      })),
    ],
  };
};

/** Adapts Topic Modelling's two-output contract to the shared Add-to-Workspace dialog. */
export function TopicModelingAddToWorkspaceDialog({
  open,
  onOpenChange,
  sources,
  selectedTopicIds,
  isSubmitting,
  onSubmit,
}: Props) {
  const selectedTopicCount =
    selectedTopicIds && selectedTopicIds.length > 0 ? selectedTopicIds.length : null;
  const [rowUnit, setRowUnit] = useState<TopicModelingDetachRowUnit>('documents');
  const topicScope =
    selectedTopicCount === null
      ? ' All topics will be included.'
      : ` ${String(selectedTopicCount)} selected topic${selectedTopicCount === 1 ? '' : 's'} will be included.`;
  return (
    <AddToWorkspaceDialog
      // Remount per mode so default names and column choices match the mode.
      key={rowUnit}
      open={open}
      onOpenChange={onOpenChange}
      title="Add Topic Modelling results to Project"
      description={
        <>
          {rowUnit === 'documents'
            ? 'For each selected source, creates a Data Block with one row per document and its topic coverage, and a Data Block of topic meanings.'
            : "For each selected source, creates a Data Block with one row per topic in each document, and a Data Block of topic meanings. The document column holds only that topic's segments, joined by line breaks. Every segment of a chosen topic is taken, also from documents outside its bubble, so there can be more documents than the bubble counts."}
          {topicScope}
        </>
      }
      options={
        <div className="flex flex-wrap items-center gap-3">
          <Label id="topic-detach-row-unit-label">Rows</Label>
          <Tabs
            value={rowUnit}
            onValueChange={(value) => {
              setRowUnit(value as TopicModelingDetachRowUnit);
            }}
            aria-labelledby="topic-detach-row-unit-label"
          >
            <TabsList>
              <TabsTrigger value="documents">One row per document</TabsTrigger>
              <TabsTrigger value="topics">One row per topic</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      }
      sources={sources.map((source) => createDialogSource(source, rowUnit, selectedTopicIds))}
      isSubmitting={isSubmitting}
      allowSourceSelection
      columnsLabel="Source columns"
      onSubmit={(selections) => {
        onSubmit(selections, rowUnit);
      }}
    />
  );
}
