import { useState } from 'react';
import type {
  DataBlockExportFormat,
  SortedDataBlockCreationSource,
  RunAllSourceTableResource,
} from '@/api';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AddToWorkspaceDialog,
  type AddToWorkspaceColumn,
  type AddToWorkspaceSource,
} from './AddToWorkspaceDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  nameSuffix: string;
  sources: RunAllSourceTableResource[];
  isSubmitting: boolean;
  /** Add to Project passes only the sources; Download also passes the format. */
  onSubmit: (sources: SortedDataBlockCreationSource[], format?: DataBlockExportFormat) => void;
  mode?: 'match' | 'document';
  allowSourceSelection?: boolean;
  /** Download the same table as a CSV or Excel file instead (issue 352). */
  purpose?: 'add' | 'download';
}

/** Spreadsheet formats offered by a Result download (issue 352). */
const DOWNLOAD_FORMATS: { value: DataBlockExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
];

const addColumn = (columns: AddToWorkspaceColumn[], next: AddToWorkspaceColumn): void => {
  const existing = columns.find((column) => column.name === next.name);
  if (!existing) {
    columns.push(next);
    return;
  }
  if (next.required) existing.required = true;
  if (next.defaultSelected) existing.defaultSelected = true;
  existing.requiredDescription ??= next.requiredDescription;
  existing.dependsOn ??= next.dependsOn;
  existing.recommendedDescription ??= next.recommendedDescription;
  existing.keepOnSelectNone ??= next.keepOnSelectNone;
  existing.uncheckedWarning ??= next.uncheckedWarning;
};

/**
 * Character positions in the document column: without it they mean nothing,
 * so they follow it (issue 355). Mirrors DOCUMENT_POSITION_COLUMNS in the
 * backend's generated_columns.py.
 */
const DOCUMENT_POSITION_COLUMNS = new Set([
  'CONC_start_idx',
  'CONC_end_idx',
  'QUOTE_speaker_start_idx',
  'QUOTE_speaker_end_idx',
  'QUOTE_quote_start_idx',
  'QUOTE_quote_end_idx',
  'QUOTE_verb_start_idx',
  'QUOTE_verb_end_idx',
]);

const createResultSource = (
  source: RunAllSourceTableResource,
  mode: 'match' | 'document',
  nameSuffix: string,
): AddToWorkspaceSource => {
  const columns: AddToWorkspaceColumn[] = [];
  // One row per match: the document is recommended but can be left out, since
  // a long one can break an Excel download (issue 355). Leaving it out is the
  // user's own choice: Select none keeps it. One row per document: it is the row.
  const positions = source.analysis_columns.filter((column) =>
    DOCUMENT_POSITION_COLUMNS.has(column),
  );
  addColumn(
    columns,
    mode === 'document'
      ? { name: source.document_column, required: true, requiredDescription: 'document, required' }
      : {
          name: source.document_column,
          defaultSelected: true,
          recommendedDescription: 'recommended',
          keepOnSelectNone: true,
          uncheckedWarning:
            `Without ${source.document_column}, you can't check these results against the original text later.` +
            (positions.length > 0
              ? ` The positions in it (${positions.join(', ')}) are left out too.`
              : ''),
        },
  );

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
      addColumn(columns, {
        name: column,
        defaultSelected: true,
        ...(DOCUMENT_POSITION_COLUMNS.has(column) ? { dependsOn: source.document_column } : {}),
      });
    }
  }

  return {
    id: source.node_id,
    name: source.node_name,
    defaultName: `${source.node_name}_${nameSuffix}`,
    columns,
  };
};

/** Adapts Concordance and Quotation Results to the shared Add-to-Workspace dialog. */
export function ResultAddToWorkspaceDialog({
  open,
  onOpenChange,
  title,
  nameSuffix,
  sources,
  isSubmitting,
  onSubmit,
  mode = 'match',
  allowSourceSelection = false,
  purpose = 'add',
}: Props) {
  const [format, setFormat] = useState<DataBlockExportFormat>('csv');
  return (
    <AddToWorkspaceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        purpose === 'download'
          ? 'Choose which Result columns go in the file. It holds the same table Add to Project would create.'
          : 'Choose which immutable Result columns create new Project Data Blocks.'
      }
      sources={sources.map((source) => createResultSource(source, mode, nameSuffix))}
      isSubmitting={isSubmitting}
      allowSourceSelection={allowSourceSelection}
      purpose={purpose}
      options={
        purpose === 'download' ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="result-download-format">Format</Label>
            <Select
              value={format}
              onValueChange={(value) => {
                setFormat(value as DataBlockExportFormat);
              }}
            >
              <SelectTrigger id="result-download-format" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOWNLOAD_FORMATS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : undefined
      }
      onSubmit={(selections) => {
        const chosen = selections.map((selection) => ({
          source_node_id: selection.sourceId,
          selected_columns: selection.selectedColumns,
          new_node_name: selection.newName,
        }));
        if (purpose === 'download') onSubmit(chosen, format);
        else onSubmit(chosen);
      }}
    />
  );
}
