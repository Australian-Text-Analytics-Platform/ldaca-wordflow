import {
  AddToProjectDialog,
  type AddToProjectSelection,
  type AddToProjectSource,
} from '../../common/components/AddToProjectDialog';

export interface TopicModelingAddToProjectSource {
  id: string;
  name: string;
  columns: string[];
  documentColumn: string;
}

export type TopicModelingAddToProjectSelection = AddToProjectSelection;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: TopicModelingAddToProjectSource[];
  selectedTopicCount: number | null;
  isSubmitting: boolean;
  onSubmit: (sources: TopicModelingAddToProjectSelection[]) => void;
}

const createDialogSource = (source: TopicModelingAddToProjectSource): AddToProjectSource => ({
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
});

/** Adapts Topic Modelling's two-output contract to the shared Add-to-Project dialog. */
export function TopicModelingAddToProjectDialog({
  open,
  onOpenChange,
  sources,
  selectedTopicCount,
  isSubmitting,
  onSubmit,
}: Props) {
  return (
    <AddToProjectDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Topic Modelling results to Project"
      description={
        <>
          Creates topic-data and topic-meanings Data Blocks for each selected source.
          {selectedTopicCount === null
            ? ' All topics will be included.'
            : ` ${String(selectedTopicCount)} selected topic${selectedTopicCount === 1 ? '' : 's'} will be included.`}
        </>
      }
      sources={sources.map(createDialogSource)}
      isSubmitting={isSubmitting}
      allowSourceSelection
      columnsLabel="Source columns"
      onSubmit={onSubmit}
    />
  );
}
