import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AddToWorkspaceDialog,
  type AddToWorkspaceSelection,
  type AddToWorkspaceSource,
} from '../../common/components/AddToWorkspaceDialog';

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
  selectedTopicCount: number | null;
  isSubmitting: boolean;
  onSubmit: (
    sources: TopicModelingAddToWorkspaceSelection[],
    rowUnit: TopicModelingDetachRowUnit,
  ) => void;
}

const PER_TOPIC_COLUMNS = ['TOPIC_topic', 'TOPIC_share', 'TOPIC_segment_count'];

const createDialogSource = (
  source: TopicModelingAddToWorkspaceSource,
  rowUnit: TopicModelingDetachRowUnit,
): AddToWorkspaceSource => {
  if (rowUnit === 'topics') {
    return {
      id: source.id,
      name: source.name,
      defaultName: `${source.name} topic segments`,
      columns: [
        ...PER_TOPIC_COLUMNS.map((name) => ({
          name,
          required: true,
          includeInSubmission: false,
          title: 'The topic, its share of the document and its segment count are always included.',
        })),
        ...source.columns.map((column) =>
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
    defaultName: `${source.name} topics`,
    columns: [
      {
        name: 'TOPIC_top1',
        required: true,
        includeInSubmission: false,
        title: 'The dominant topic assignment is always included.',
      },
      ...source.columns.map((column) => ({
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
  selectedTopicCount,
  isSubmitting,
  onSubmit,
}: Props) {
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
      title="Add Topic Modelling results to Workspace"
      description={
        <>
          {rowUnit === 'documents'
            ? 'Creates topic-data and topic-meanings Data Blocks for each selected source, with one row per document and its topic coverage.'
            : "Creates topic-segment and topic-meanings Data Blocks for each selected source, with one row per document and topic. The document column holds only that topic's segments, joined by line breaks."}
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
              <TabsTrigger value="documents">Per document</TabsTrigger>
              <TabsTrigger value="topics">Per topic</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      }
      sources={sources.map((source) => createDialogSource(source, rowUnit))}
      isSubmitting={isSubmitting}
      allowSourceSelection
      columnsLabel="Source columns"
      onSubmit={(selections) => {
        onSubmit(selections, rowUnit);
      }}
    />
  );
}
