import type { SequentialSourceDescriptor } from '@/api';
import {
  AddToProjectDialog,
  type AddToProjectSelection,
  type AddToProjectSource,
} from '../../common/components/AddToProjectDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SequentialSourceDescriptor;
  axisColumn: string;
  groupByColumns: readonly string[];
  filterSummary: string;
  isSubmitting: boolean;
  onSubmit: (selection: AddToProjectSelection) => void;
}

const createDialogSource = (
  source: SequentialSourceDescriptor,
  axisColumn: string,
  groupByColumns: readonly string[],
): AddToProjectSource => {
  const defaultColumns = new Set(
    [source.document_column, ...groupByColumns].filter(
      (column): column is string => typeof column === 'string',
    ),
  );
  return {
    id: source.node_id,
    name: source.node_name,
    defaultName: `${source.node_name}_trends`,
    columns: source.columns.map((column) => ({
      name: column,
      required: column === axisColumn,
      requiredDescription: column === axisColumn ? 'axis, required' : undefined,
      defaultSelected: column !== axisColumn && defaultColumns.has(column),
    })),
  };
};

/** Adapts one immutable Trends source and active chart filter to the shared dialog. */
export function SequentialAddToProjectDialog({
  open,
  onOpenChange,
  source,
  axisColumn,
  groupByColumns,
  filterSummary,
  isSubmitting,
  onSubmit,
}: Props) {
  const dialogSource = createDialogSource(source, axisColumn, groupByColumns);
  return (
    <AddToProjectDialog
      key={`${source.node_id}:${axisColumn}:${groupByColumns.join('|')}`}
      open={open}
      onOpenChange={onOpenChange}
      title="Add Trends selection to Project"
      description={`Creates original source rows from ${filterSummary}.`}
      sources={[dialogSource]}
      isSubmitting={isSubmitting}
      onSubmit={(selections) => {
        const selection = selections[0];
        if (selection) onSubmit(selection);
      }}
    />
  );
}
