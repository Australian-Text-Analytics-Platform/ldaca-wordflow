import { useEffect, useRef } from 'react';
import type { ConcordanceNodeResult as ConcordanceResultEntry } from '@/api';
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AnalysisTableFrame } from '@/features/views/common/components/AnalysisTableScrollArea';
import { ServerPaginationFooter } from '@/features/views/common/components/ServerPaginationFooter';
import { useServerTable } from '@/features/views/common/hooks/useServerTable';
import type { WorkspaceNodeMetadata } from '@/features/workspace/common/workspaceNodeMetadata';
import { GroupedResultsPageSizeSummary } from '../../common/components/GroupedResultsPageSizeSummary';
import { PAGE_SIZE_OPTIONS_DEFAULT } from '../../common/constants';
import type { NodeColumnSelection } from '../../common/nodeSelectionTypes';
import { batchProcessedCount } from '../concordanceDispersionDomain';
import { findConcordanceSourceNode, getConcordanceSourceColor } from '../concordanceSourceDomain';
import { CONCORDANCE_COMBINED_NODE_KEY } from '../concordanceTableDomain';
import type { PaginationState } from '../hooks/useConcordanceTaskFlow';
import {
  concordanceHeaderMode,
  concordanceSortColumn,
  concordanceSortHint,
  concordanceRowBand,
} from '../concordanceTablePresentation';
import { GREY } from '../../common/vizPalette';
import { normalizeNodeColor } from '@/lib/nodeColor';
import { ConcordancePlainHeader, ConcordanceRowsTable } from './ConcordanceRowsTable';
import {
  ConcordanceCombinedResultHeader,
  ConcordanceSourceResultHeader,
} from './ConcordanceResultCardHeader';
import { buildConcordanceTableModel, type ConcordanceRow } from './concordanceTableModel';
import { SortableHeader } from './SortableHeader';
import { ConcordanceRowDetailController } from './ConcordanceRowDetailController';
import { NUDGE_TARGETS } from '@/features/nudges/nudges';
import { ConcordancePreviewNudge } from './ConcordancePreviewNudge';

export interface ConcordanceTableNodeBlockProps {
  nodeKey: string;
  nodeData: ConcordanceResultEntry;
  context: {
    nodeId: string;
    paginationKey: string;
    requestNodeId: string;
    column: string;
    displayName?: string;
    nodeColor?: string;
  };

  // Search + display
  searchWord: string;
  caseSensitive: boolean;
  showMetadata: boolean;
  selectedMetadataColumns: string[];
  /** Column order from dragged headers, and how to save a new one (issue 373). */
  columnOrder?: readonly string[];
  onReorderColumns?: (order: string[]) => void;
  reviewRowUnit: 'documents' | 'matches' | null;
  highlightL1R1: boolean;
  resultSummary?: ReactNode;

  // Workspace selection
  panelSelectedNodes: WorkspaceNodeMetadata[];
  effectiveNodeColumnSelections: NodeColumnSelection[];

  // Colors (combined view)
  sourceColorMap: Record<string, string>;
  defaultPalette: string[];

  // Pagination + per-node state
  nodePagination: PaginationState;
  globalPageSize: number;
  /** Changes the single shared page size for all result tables (footer selector). */
  onPageSizeChange: (pageSize: number) => void;
  combinedPage: number;
  combinedLoading: boolean;
  nodeLoading: Record<string, boolean>;

  // Handlers
  handleSort: (columnKey: string, paginationKey: string, requestNodeId: string) => void;
  /** Clears a column sort, back to the Data Block order. */
  handleResetSort?: (paginationKey: string) => void;
  handlePageChange: (newPage: number, paginationKey: string, requestNodeId: string) => void;
  setCombinedPage: (page: number) => void;
}

/**
 * Rendered by: ConcordanceResultsPanel for each table-oriented concordance result block.
 * Dispatches to the combined ("both blocks") view or the per-node view, each of
 * which owns its own server-paginated TanStack table instance. The split keeps
 * the `useServerTable` hook unconditional within each component (the two paths
 * have different row models, headers, and footer actions).
 */
export function ConcordanceTableNodeBlock(props: ConcordanceTableNodeBlockProps) {
  if (props.nodeKey === CONCORDANCE_COMBINED_NODE_KEY) {
    return <CombinedConcordanceTable {...props} />;
  }
  return <PerNodeConcordanceTable {...props} />;
}

/**
 * Rendered by: ConcordanceTableNodeBlock for the merged two-block view.
 *
 * Preview pagination walks source documents. Review table pagination walks
 * matches, with one displayed row per matched span. The projected Result's
 * `total_source_rows` and page size therefore use the active mode's explicit
 * unit rather than inferring it from the rendered groups.
 * Flow: derive display columns, build the server table, then render the coloured
 * KWIC rows and the shared pagination footer.
 */
function CombinedConcordanceTable({
  nodeData,
  searchWord,
  caseSensitive,
  showMetadata,
  selectedMetadataColumns,
  columnOrder,
  onReorderColumns,
  effectiveNodeColumnSelections,
  panelSelectedNodes,
  sourceColorMap,
  defaultPalette,
  combinedPage,
  globalPageSize,
  onPageSizeChange,
  combinedLoading,
  setCombinedPage,
  reviewRowUnit,
  highlightL1R1,
  resultSummary,
}: ConcordanceTableNodeBlockProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [globalPageSize]);
  const { rows, tableColumns, columns } = buildConcordanceTableModel({
    nodeData,
    showMetadata,
    selectedMetadataColumns,
    columnOrder,
  });
  const table = useServerTable<ConcordanceRow>({
    data: rows,
    columns,
    rowCount: nodeData.pagination.total_source_rows,
    pageIndex: combinedPage - 1,
    pageSize: globalPageSize,
    // Bridges TanStack paging to the combined-view page + page-size handlers.
    // Invoked by useServerTable when combined-view pagination changes.
    onPaginationChange: (next) => {
      if (next.pageSize !== globalPageSize) {
        if (viewportRef.current) viewportRef.current.scrollTop = 0;
        onPageSizeChange(next.pageSize);
        return;
      }
      const newPage = next.pageIndex + 1;
      if (newPage !== combinedPage) {
        if (viewportRef.current) viewportRef.current.scrollTop = 0;
        setCombinedPage(newPage);
      }
    },
  });
  const detailItems = rows.map((row) => {
    const sourceNode = row.__source_node
      ? findConcordanceSourceNode(panelSelectedNodes, row.__source_node)
      : null;
    const selection = sourceNode
      ? effectiveNodeColumnSelections.find((entry) => entry.nodeId === sourceNode.id)
      : null;
    return {
      row,
      nodeId: sourceNode?.id ?? '',
      column: selection?.column ?? '',
    };
  });

  const combinedPageSizeSummary = (
    <GroupedResultsPageSizeSummary
      groups={nodeData.data}
      totalProcessed={batchProcessedCount(nodeData.pagination)}
      totalDocuments={nodeData.pagination.total_source_rows}
    />
  );
  const combinedBelowTable = (
    <>
      {reviewRowUnit === null ? (
        <div className="border-t border-surface-border bg-panel/40 px-4 pt-2 text-body text-description">
          {combinedPageSizeSummary}
          <ConcordancePreviewNudge
            groups={nodeData.data}
            pagination={nodeData.pagination}
            occurrence={`${searchWord}\0${String(caseSensitive)}\0${String(globalPageSize)}\0${String(nodeData.pagination.page)}`}
          />
        </div>
      ) : null}
      <ServerPaginationFooter
        table={table}
        pageIndex={combinedPage - 1}
        pageSize={globalPageSize}
        rowCount={nodeData.pagination.total_source_rows}
        pageSizeLabel={
          reviewRowUnit === null
            ? 'Documents per page'
            : panelSelectedNodes.length > 1
              ? 'Matches per page'
              : 'Matches per page'
        }
        pageSizeNudgeTarget={reviewRowUnit === null ? NUDGE_TARGETS.concordancePageSize : undefined}
        pageSizeOptions={[...PAGE_SIZE_OPTIONS_DEFAULT]}
        loading={combinedLoading}
        showPageSize
      />
      {resultSummary ? <div className="border-t border-surface-border">{resultSummary}</div> : null}
    </>
  );

  return (
    <ConcordanceRowDetailController
      sequenceKey={`${CONCORDANCE_COMBINED_NODE_KEY}\0table\0${reviewRowUnit ?? 'preview'}\0${String(globalPageSize)}`}
      items={detailItems}
      page={nodeData.pagination.page}
      hasPreviousPage={nodeData.pagination.has_prev}
      hasNextPage={nodeData.pagination.has_next}
      loading={combinedLoading}
      onPageChange={setCombinedPage}
      searchWord={searchWord}
      caseSensitive={caseSensitive}
    >
      {(openDetailAt) => (
        <Card data-testid="concordance-table-combined-card" className="mb-6 overflow-hidden">
          <ConcordanceCombinedResultHeader
            nodes={panelSelectedNodes}
            sourceColorMap={sourceColorMap}
            defaultPalette={defaultPalette}
            testId="concordance-table-combined-header"
          />
          <CardContent className="bg-panel/20 p-3">
            <AnalysisTableFrame
              resultKey="concordance.table"
              maxHeightClass="max-h-100"
              belowTable={combinedBelowTable}
              viewportRef={viewportRef}
            >
              <ConcordanceRowsTable
                table={table}
                rows={rows}
                tableColumns={tableColumns}
                onReorderColumns={onReorderColumns}
                searchWord={searchWord}
                loading={combinedLoading}
                highlightL1R1={highlightL1R1}
                getSourceColor={(row) => {
                  if (!row.__source_node) return defaultPalette[0] ?? GREY;
                  return getConcordanceSourceColor(
                    row.__source_node,
                    sourceColorMap,
                    defaultPalette,
                  );
                }}
                renderHeader={(header) => (
                  <ConcordancePlainHeader key={header.id} header={header} />
                )}
                getRowClassName={() => 'cursor-pointer'}
                getRowStyle={(row) => {
                  const color = getConcordanceSourceColor(
                    row.__source_node,
                    sourceColorMap,
                    defaultPalette,
                  );
                  return { backgroundColor: `${color}20` };
                }}
                onRowClick={(_row, index) => {
                  const item = detailItems[index];
                  if (item?.nodeId && item.column) openDetailAt(index);
                }}
              />
            </AnalysisTableFrame>
          </CardContent>
        </Card>
      )}
    </ConcordanceRowDetailController>
  );
}

/**
 * Rendered by: ConcordanceTableNodeBlock for a single Data Block's results.
 *
 * Preview pagination walks source documents while Review table pagination
 * walks matches. `total_source_rows` already carries the projection's unit.
 * Flow: derive display columns, apply the shared phase-aware header policy to
 * both rendering and click dispatch, tint direct match/L1/R1 cells with the
 * source colour, then render the server-paginated table and footer.
 */
function PerNodeConcordanceTable({
  nodeKey,
  nodeData,
  context,
  searchWord,
  caseSensitive,
  showMetadata,
  selectedMetadataColumns,
  columnOrder,
  onReorderColumns,
  panelSelectedNodes,
  nodePagination,
  globalPageSize,
  onPageSizeChange,
  nodeLoading,
  handleSort,
  handleResetSort,
  handlePageChange,
  reviewRowUnit,
  highlightL1R1,
  resultSummary,
}: ConcordanceTableNodeBlockProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [globalPageSize]);
  const { nodeId: actualNodeId, paginationKey, requestNodeId, column } = context;

  const { rows, tableColumns, columns } = buildConcordanceTableModel({
    nodeData,
    showMetadata,
    selectedMetadataColumns,
    columnOrder,
  });

  const currentNodePagination = nodePagination[paginationKey];
  const currentPage = currentNodePagination?.currentPage ?? 1;
  const nodeIsLoading = Boolean(nodeLoading[paginationKey]);
  const isReview = reviewRowUnit !== null;
  const headerMode = (columnKey: string) =>
    concordanceHeaderMode({
      columnKey,
      documentColumn: column,
      metadataColumns: nodeData.metadata.metadata_columns,
      isCombined: false,
      isReview,
    });
  const handleEligibleSort = (columnKey: string) => {
    handleSort(columnKey, paginationKey, requestNodeId);
  };

  const table = useServerTable<ConcordanceRow>({
    data: rows,
    columns,
    rowCount: nodeData.pagination.total_source_rows,
    pageIndex: currentPage - 1,
    pageSize: globalPageSize,
    // Bridges TanStack paging to the per-node page + page-size handlers.
    // Invoked by useServerTable when this node's pagination changes.
    onPaginationChange: (next) => {
      if (next.pageSize !== globalPageSize) {
        if (viewportRef.current) viewportRef.current.scrollTop = 0;
        onPageSizeChange(next.pageSize);
        return;
      }
      const newPage = next.pageIndex + 1;
      if (newPage !== currentPage) {
        if (viewportRef.current) viewportRef.current.scrollTop = 0;
        handlePageChange(newPage, paginationKey, requestNodeId);
      }
    },
  });
  const detailItems = rows.map((row) => ({
    row,
    nodeId: actualNodeId,
    column,
  }));

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty-string display name must fall back to the node key
  const dataBlockLabel = context.displayName || nodeKey;
  const sourceColor = normalizeNodeColor(context.nodeColor) ?? GREY;
  const pageSizeSummary = (
    <GroupedResultsPageSizeSummary
      groups={nodeData.data}
      totalProcessed={batchProcessedCount(nodeData.pagination)}
      totalDocuments={nodeData.pagination.total_source_rows}
    />
  );
  const belowTable = (
    <>
      {reviewRowUnit === null ? (
        <div className="border-t border-surface-border bg-panel/40 px-4 pt-2 text-body text-description">
          {pageSizeSummary}
          <ConcordancePreviewNudge
            groups={nodeData.data}
            pagination={nodeData.pagination}
            occurrence={`${searchWord}\0${String(caseSensitive)}\0${String(globalPageSize)}\0${String(nodeData.pagination.page)}`}
          />
        </div>
      ) : null}
      <ServerPaginationFooter
        table={table}
        pageIndex={currentPage - 1}
        pageSize={globalPageSize}
        rowCount={nodeData.pagination.total_source_rows}
        pageSizeLabel={
          reviewRowUnit === null
            ? 'Documents per page'
            : panelSelectedNodes.length > 1
              ? 'Matches per page'
              : 'Matches per page'
        }
        pageSizeNudgeTarget={reviewRowUnit === null ? NUDGE_TARGETS.concordancePageSize : undefined}
        pageSizeOptions={[...PAGE_SIZE_OPTIONS_DEFAULT]}
        loading={nodeIsLoading}
        showPageSize
      />
      {resultSummary ? <div className="border-t border-surface-border">{resultSummary}</div> : null}
    </>
  );

  return (
    <ConcordanceRowDetailController
      sequenceKey={`${nodeKey}\0table\0${reviewRowUnit ?? 'preview'}\0${String(globalPageSize)}\0${currentNodePagination?.sortBy ?? ''}\0${String(currentNodePagination?.descending ?? false)}`}
      items={detailItems}
      page={nodeData.pagination.page}
      hasPreviousPage={nodeData.pagination.has_prev}
      hasNextPage={nodeData.pagination.has_next}
      loading={nodeIsLoading}
      onPageChange={(nextPage) => {
        handlePageChange(nextPage, paginationKey, requestNodeId);
      }}
      searchWord={searchWord}
      caseSensitive={caseSensitive}
    >
      {(openDetailAt) => (
        <Card data-testid="concordance-table-source-card" className="mb-6 overflow-hidden">
          <ConcordanceSourceResultHeader
            name={dataBlockLabel}
            color={sourceColor}
            testId="concordance-table-source-header"
            actions={
              handleResetSort && currentNodePagination?.sortBy ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Show the rows in Data Block order again: by document, then position"
                  onClick={() => {
                    handleResetSort(paginationKey);
                  }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Original order
                </Button>
              ) : null
            }
          />
          <CardContent className="bg-panel/20 p-3">
            <AnalysisTableFrame
              resultKey="concordance.table"
              maxHeightClass="max-h-100"
              belowTable={belowTable}
              viewportRef={viewportRef}
            >
              <ConcordanceRowsTable
                table={table}
                rows={rows}
                tableColumns={tableColumns}
                onReorderColumns={onReorderColumns}
                searchWord={searchWord}
                loading={nodeIsLoading}
                highlightL1R1={highlightL1R1}
                getSourceColor={() => sourceColor}
                renderHeader={(header) => {
                  const mode = headerMode(header.column.id);
                  return mode === 'sortable' ? (
                    <SortableHeader
                      key={header.id}
                      columnKey={header.column.id}
                      label={header.column.id}
                      sortKey={concordanceSortColumn(header.column.id, highlightL1R1)}
                      hint={concordanceSortHint(header.column.id, highlightL1R1)}
                      paginationKey={paginationKey}
                      requestNodeId={requestNodeId}
                      nodePagination={nodePagination}
                      onSort={handleEligibleSort}
                    />
                  ) : (
                    <ConcordancePlainHeader
                      key={header.id}
                      header={header}
                      hint={mode === 'preview-review-hint' ? 'Run to enable sorting' : undefined}
                    />
                  );
                }}
                getRowClassName={(row, index) =>
                  `cursor-pointer ${concordanceRowBand(row, index) === 0 ? 'bg-surface' : 'bg-panel'}`
                }
                onRowClick={(_row, index) => {
                  if (actualNodeId && column) openDetailAt(index);
                }}
              />
            </AnalysisTableFrame>
          </CardContent>
        </Card>
      )}
    </ConcordanceRowDetailController>
  );
}
