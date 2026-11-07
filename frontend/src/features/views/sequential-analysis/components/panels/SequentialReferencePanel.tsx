import { useQuery } from '@tanstack/react-query';

import HelpIcon from '@/components/help/HelpIcon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TokenizerModelSelector from '@/features/views/common/components/TokenizerModelSelector';
import type { WorkspaceNodeInfo } from '@/api';
import { isArrowStringField } from '@/lib/arrow/arrowTable';
import { nodeSchemaQueryOptions } from '@/lib/nodeSchema';
import { referenceOptions } from '../../trendsReference';

const NONE_VALUE = '__ldaca__trends_no_reference__';
const ROWS_ONLY_VALUE = '__ldaca__trends_rows_only__';

export interface SequentialReferencePanelProps {
  workspaceId: string | null;
  /** Every Data Block in the Project, for the picker and its lineage. */
  nodes: readonly WorkspaceNodeInfo[];
  /** The analysed Data Block, which cannot be its own reference. */
  activeNodeId: string;
  disabled: boolean;
  referenceNodeId: string;
  /** Called with the chosen Data Block, or null for none. */
  onReferenceChange: (node: WorkspaceNodeInfo | null) => void;
  referenceTextColumn: string;
  onReferenceTextColumnChange: (column: string) => void;
  referenceTokenizerModel: string;
  onReferenceTokenizerModelChange: (model: string) => void;
}

/**
 * Chooses the reference Data Block a Trends result is normalised against,
 * and the text column whose words are counted, with its tokeniser.
 *
 * Rendered by: SequentialAnalysisParameterPanel, under Group By. The Data
 * Blocks the analysed one was made from come first and are marked, since a
 * rate is only meaningful against the corpus the rows came from; choosing
 * another shows a warning but is allowed, for a subset against its whole.
 */
export function SequentialReferencePanel({
  workspaceId,
  nodes,
  activeNodeId,
  disabled,
  referenceNodeId,
  onReferenceChange,
  referenceTextColumn,
  onReferenceTextColumnChange,
  referenceTokenizerModel,
  onReferenceTokenizerModelChange,
}: SequentialReferencePanelProps) {
  const options = activeNodeId ? referenceOptions(nodes, activeNodeId) : [];
  const chosen = options.find((option) => option.id === referenceNodeId);
  const schemaQuery = useQuery({
    ...nodeSchemaQueryOptions({
      workspaceId: workspaceId ?? '',
      nodeId: referenceNodeId,
    }),
    enabled: Boolean(workspaceId && referenceNodeId && chosen),
  });
  const textColumns = (schemaQuery.data ?? [])
    .filter((column) => isArrowStringField(column.field))
    .map((column) => column.name);
  const columnIsText = referenceTextColumn !== '' && textColumns.includes(referenceTextColumn);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="trends-reference" className="block text-body font-medium text-foreground">
          Normalise against (optional)
        </label>
        <HelpIcon
          targetKey="analysis.sequential-analysis.reference"
          label="About the reference Data Block"
          tooltip="Show rates, such as hits per million words, against the Data Block these rows were made from."
        />
      </div>
      <Select
        value={chosen ? referenceNodeId : NONE_VALUE}
        onValueChange={(value) => {
          onReferenceChange(
            value === NONE_VALUE ? null : (nodes.find((node) => node.id === value) ?? null),
          );
        }}
        disabled={disabled}
      >
        <SelectTrigger id="trends-reference" className="w-full" aria-label="Reference Data Block">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>None: show counts only</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
              {option.ancestor ? ' · made from this' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen && !chosen.ancestor ? (
        <p className="rounded-md border border-warning bg-warning-background px-3 py-2 text-body text-foreground">
          {chosen.name} is not a Data Block this one was made from. A rate only means something when
          the reference holds every text these rows came from, such as the whole corpus for a
          filtered part of it.
        </p>
      ) : null}
      {chosen ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="trends-reference-column"
              className="mb-1 block text-label-secondary font-medium text-description"
            >
              Count words in
            </label>
            <Select
              value={columnIsText ? referenceTextColumn : ROWS_ONLY_VALUE}
              onValueChange={(value) => {
                onReferenceTextColumnChange(value === ROWS_ONLY_VALUE ? '' : value);
              }}
              disabled={disabled || schemaQuery.isPending}
            >
              <SelectTrigger
                id="trends-reference-column"
                className="w-full"
                aria-label="Reference text column"
              >
                <SelectValue placeholder="Rows only" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROWS_ONLY_VALUE}>Rows only (no word counts)</SelectItem>
                {textColumns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-label-secondary text-description">
              {columnIsText
                ? "Words are counted as in Frequency's Per million."
                : 'Rows give % of reference rows; a text column adds per million words.'}
            </p>
          </div>
          {columnIsText ? (
            <TokenizerModelSelector
              workspaceId={workspaceId}
              nodeId={referenceNodeId}
              column={referenceTextColumn}
              value={referenceTokenizerModel}
              autoSelectRecommended
              disabled={disabled}
              onChange={(model) => {
                onReferenceTokenizerModelChange(model);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
