import type { SequentialDataBlockCreationAnalysisRequest } from '@/api';
import type { AddToProjectSelection } from '../common/components/AddToProjectDialog';

/** Builds the immutable supporting request from the active Trends filters. */
export function buildSequentialDataBlockCreationRequest(
  selection: AddToProjectSelection,
  selectedPeriodIds: readonly number[],
  excludedGroupIndices: readonly number[],
): SequentialDataBlockCreationAnalysisRequest & { kind: 'sequential_data_block_creation' } {
  return {
    kind: 'sequential_data_block_creation',
    source: {
      source_node_id: selection.sourceId,
      selected_columns: selection.selectedColumns,
      new_node_name: selection.newName,
      selected_period_indices: selectedPeriodIds.length > 0 ? [...selectedPeriodIds] : null,
      excluded_group_indices: [...excludedGroupIndices],
    },
  };
}
