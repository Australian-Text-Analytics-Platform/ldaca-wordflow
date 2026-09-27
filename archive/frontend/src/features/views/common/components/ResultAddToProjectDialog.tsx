import type { DataBlockCreationSource, RunAllSourceTableResource } from '@/api';
import {
  AddToProjectDialog,
  type AddToProjectColumn,
  type AddToProjectSource,
} from './AddToProjectDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  nameSuffix: string;
  sources: RunAllSourceTableResource[];
  isSubmitting: boolean;
  onSubmit: (sources: DataBlockCreationSource[]) => void;
  mode?: 'match' | 'document';
  allowSourceSelection?: boolean;
}

const addColumn = (columns: AddToProjectColumn[], next: AddToProjectColumn): void => {
  const existing = columns.find((column) => column.name === next.name);
  if (!existing) {
    columns.push(next);
    return;
  }
  if (next.required) existing.required = true;
  if (next.defaultSelected) existing.defaultSelected = true;
  existing.requiredDescription ??= next.requiredDescription;
};

const createResultSource = (
  source: RunAllSourceTableResource,
  mode: 'match' | 'document',
  nameSuffix: string,
): AddToProjectSource => {
  const columns: AddToProjectColumn[] = [];
  addColumn(columns, {
    name: source.document_column,
    required: true,
    requiredDescription: 'document, required',
  });

  if (mode === 'document') {
    addColumn(columns, {
      name: 'CONC_extraction',
      required: true,
      requiredDescription: 'required',
    });
  }

  for (const column of source.metadata_columns) addColumn(columns, { name: column });

  if (mode === 'match') {
    for (const column of source.analysis_columns) {
      addColumn(columns, { name: column, defaultSelected: true });
    }
  }

  return {
    id: source.node_id,
    name: source.node_name,
    defaultName: `${source.node_name}_${nameSuffix}`,
    columns,
  };
};

/** Adapts Concordance and Quotation Results to the shared Add-to-Project dialog. */
export function ResultAddToProjectDialog({
  open,
  onOpenChange,
  title,
  nameSuffix,
  sources,
  isSubmitting,
  onSubmit,
  mode = 'match',
  allowSourceSelection = false,
}: Props) {
  return (
    <AddToProjectDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Choose which immutable Result columns create new Project Data Blocks."
      sources={sources.map((source) => createResultSource(source, mode, nameSuffix))}
      isSubmitting={isSubmitting}
      allowSourceSelection={allowSourceSelection}
      onSubmit={(selections) => {
        onSubmit(
          selections.map((selection) => ({
            source_node_id: selection.sourceId,
            selected_columns: selection.selectedColumns,
            new_node_name: selection.newName,
          })),
        );
      }}
    />
  );
}
