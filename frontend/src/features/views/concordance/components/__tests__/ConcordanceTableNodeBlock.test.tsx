/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Radix exposes the imperative viewport only as an internal DOM slot. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConcordanceNodeResult } from '@/api';
import type { WorkspaceNodeMetadata } from '@/features/workspace/common/workspaceNodeMetadata';
import { GREY, foregroundForVizColor, toBgColor } from '@/features/views/common/vizPalette';
import { toNodeSurfaceColor } from '@/lib/nodeColor';
import {
  ConcordanceTableNodeBlock,
  type ConcordanceTableNodeBlockProps,
} from '../ConcordanceTableNodeBlock';
import { CONCORDANCE_COMBINED_NODE_KEY } from '../../concordanceTableDomain';

const nodeData: ConcordanceNodeResult = {
  columns: [
    'CONC_left_context',
    'CONC_matched_text',
    'CONC_right_context',
    'CONC_start_idx',
    'CONC_end_idx',
    'CONC_l1',
    'CONC_r1',
    'CONC_l1_freq',
    'CONC_r1_freq',
    'speaker',
  ],
  data: [
    [
      {
        CONC_left_context: 'before',
        CONC_matched_text: 'alpha',
        CONC_right_context: 'after',
        CONC_start_idx: 7,
        CONC_end_idx: 12,
        CONC_l1: 'before',
        CONC_r1: 'after',
        CONC_l1_freq: 2,
        CONC_r1_freq: 3,
        speaker: 'A',
      },
    ],
  ],
  metadata: {
    concordance_columns: [
      'CONC_left_context',
      'CONC_matched_text',
      'CONC_right_context',
      'CONC_start_idx',
      'CONC_end_idx',
      'CONC_l1',
      'CONC_r1',
      'CONC_l1_freq',
      'CONC_r1_freq',
    ],
    metadata_columns: ['speaker'],
    all_columns: [
      'CONC_left_context',
      'CONC_matched_text',
      'CONC_right_context',
      'CONC_start_idx',
      'CONC_end_idx',
      'CONC_l1',
      'CONC_r1',
      'CONC_l1_freq',
      'CONC_r1_freq',
      'speaker',
    ],
  },
  pagination: {
    page: 1,
    page_size: 20,
    total_source_rows: 1,
    total_source_pages: 1,
    result_count: 1,
    has_next: false,
    has_prev: false,
  },
  sorting: { sort_by: null, descending: false },
};

const buildProps = (handleSort: ConcordanceTableNodeBlockProps['handleSort']) =>
  ({
    nodeKey: 'node-1',
    nodeData,
    context: {
      nodeId: 'node-1',
      paginationKey: 'node-1',
      requestNodeId: 'node-1',
      column: 'text',
      nodeColor: '#2563eb',
    },
    searchWord: 'alpha',
    caseSensitive: false,
    showMetadata: true,
    selectedMetadataColumns: ['speaker'],
    panelSelectedNodes: [{ id: 'node-1', name: 'Documents' } as WorkspaceNodeMetadata],
    effectiveNodeColumnSelections: [],
    sourceColorMap: {},
    defaultPalette: [],
    nodePagination: {},
    globalPageSize: 20,
    onPageSizeChange: vi.fn(),
    combinedPage: 1,
    combinedLoading: false,
    nodeLoading: {},
    reviewRowUnit: null,
    highlightL1R1: true,
    handleSort,
    handlePageChange: vi.fn(),
    setCombinedPage: vi.fn(),
  }) satisfies ConcordanceTableNodeBlockProps;

const cellFor = (columnName: string): HTMLTableCellElement => {
  const columnIndex = screen
    .getAllByRole('columnheader')
    .findIndex((header) => header.textContent?.startsWith(columnName));
  return screen.getAllByRole('cell')[columnIndex] as HTMLTableCellElement;
};

describe('ConcordanceTableNodeBlock', () => {
  it('opens specialized row details with shared navigation controls', async () => {
    const user = userEvent.setup();
    render(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} />);

    await user.click(screen.getByText('alpha'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Row Details (Concordance)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Previous row' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Next row' })).toBeDisabled();
  });

  it('uses the quiet Data Block surface color above a neutral table body', () => {
    const longName = 'qldelection2020_candidate_tweets_filtered_by_username_in_AnnastaciaMP';
    const props = buildProps(vi.fn());
    render(
      <ConcordanceTableNodeBlock
        {...props}
        context={{ ...props.context, displayName: longName }}
      />,
    );

    const header = screen.getByTestId('concordance-table-source-header');
    expect(header).toHaveStyle({
      backgroundColor: toNodeSurfaceColor('#2563eb'),
    });
    expect(header).toHaveClass('text-foreground');
    expect(header).toContainElement(screen.getByTitle(longName));
    expect(screen.getByTestId('analysis-table-scroll-area').style.borderLeftWidth).toBe('');
  });

  it('falls back to the established neutral header color for invalid source metadata', () => {
    const props = buildProps(vi.fn());
    render(
      <ConcordanceTableNodeBlock
        {...props}
        context={{ ...props.context, nodeColor: 'not-a-color' }}
      />,
    );

    expect(screen.getByTestId('concordance-table-source-header')).toHaveStyle({
      backgroundColor: toNodeSurfaceColor(GREY),
    });
  });

  it('keeps generated Preview headers plain with a Run All hint while metadata sorts', async () => {
    const user = userEvent.setup();
    const handleSort = vi.fn();
    render(<ConcordanceTableNodeBlock {...buildProps(handleSort)} />);

    const generatedHeader = screen.getByRole('columnheader', { name: 'CONC_matched_text' });
    const metadataHeader = screen.getByRole('columnheader', { name: /^speaker/ });
    expect(generatedHeader).not.toHaveClass('cursor-pointer');
    expect(metadataHeader).toHaveClass('cursor-pointer');

    fireEvent.click(generatedHeader);
    expect(handleSort).not.toHaveBeenCalled();

    fireEvent.click(metadataHeader);
    expect(handleSort).toHaveBeenCalledWith('speaker', 'node-1', 'node-1');

    await user.hover(screen.getByText('CONC_matched_text'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Run to enable sorting');
  });

  it('leaves the match offsets out of the table but keeps them on the rows (issue 239)', () => {
    render(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} />);

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.some((text) => text?.startsWith('CONC_start_idx'))).toBe(false);
    expect(headers.some((text) => text?.startsWith('CONC_end_idx'))).toBe(false);
    expect(headers.some((text) => text?.startsWith('CONC_matched_text'))).toBe(true);
  });

  it('sorts generated scalar columns in separated Review', () => {
    const handleSort = vi.fn();
    render(<ConcordanceTableNodeBlock {...buildProps(handleSort)} reviewRowUnit="matches" />);

    fireEvent.click(screen.getByRole('columnheader', { name: 'CONC_l1▲▼' }));
    fireEvent.click(screen.getByRole('columnheader', { name: 'CONC_l1_freq▲▼' }));

    expect(handleSort).toHaveBeenNthCalledWith(1, 'CONC_l1', 'node-1', 'node-1');
    expect(handleSort).toHaveBeenNthCalledWith(2, 'CONC_l1_freq', 'node-1', 'node-1');
  });

  it('sorts the contexts by L1 and R1 while Highlight L1/R1 for sorting is on (issue 241)', () => {
    const handleSort = vi.fn();
    render(<ConcordanceTableNodeBlock {...buildProps(handleSort)} reviewRowUnit="matches" />);

    fireEvent.click(screen.getByRole('columnheader', { name: /^CONC_left_context/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /^CONC_right_context/ }));

    expect(handleSort).toHaveBeenNthCalledWith(1, 'CONC_l1', 'node-1', 'node-1');
    expect(handleSort).toHaveBeenNthCalledWith(2, 'CONC_r1', 'node-1', 'node-1');
  });

  it('sorts the contexts by their own text while Highlight L1/R1 for sorting is off', () => {
    const handleSort = vi.fn();
    render(
      <ConcordanceTableNodeBlock
        {...buildProps(handleSort)}
        reviewRowUnit="matches"
        highlightL1R1={false}
      />,
    );

    fireEvent.click(screen.getByRole('columnheader', { name: /^CONC_left_context/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /^CONC_right_context/ }));

    expect(handleSort).toHaveBeenNthCalledWith(1, 'CONC_left_context', 'node-1', 'node-1');
    expect(handleSort).toHaveBeenNthCalledWith(2, 'CONC_right_context', 'node-1', 'node-1');
  });

  it('shows a context header as sorted while its L1 or R1 sort is active', () => {
    render(
      <ConcordanceTableNodeBlock
        {...buildProps(vi.fn())}
        reviewRowUnit="matches"
        nodePagination={{
          'node-1': { currentPage: 1, pageSize: 20, sortBy: 'CONC_l1', descending: true },
        }}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /^CONC_left_context/ })).toHaveTextContent('▼');
    expect(screen.getByRole('columnheader', { name: /^CONC_l1▼/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^CONC_right_context/ })).toHaveTextContent(
      '▲▼',
    );
  });

  it('highlights left-last and right-first anchors while direct L1/R1 cells stay plain', () => {
    const repeatedData: ConcordanceNodeResult = {
      ...nodeData,
      data: [
        [
          {
            ...nodeData.data[0]![0]!,
            CONC_left_context: 'before x before',
            CONC_right_context: 'after x after',
          },
        ],
      ],
    };
    render(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} nodeData={repeatedData} />);

    const leftMark = screen.getByText('before', { selector: 'mark' });
    const rightMark = screen.getByText('after', { selector: 'mark' });
    expect(leftMark).toHaveTextContent('before');
    expect(leftMark).toHaveAttribute('data-match-index', '9');
    expect(rightMark).toHaveTextContent('after');
    expect(rightMark).toHaveAttribute('data-match-index', '0');
    // The word takes the source colour; no background tint (issue 242).
    for (const mark of [leftMark, rightMark]) {
      expect(mark).toHaveClass('concordance-context-anchor');
      expect(mark.style.getPropertyValue('--concordance-anchor-color')).toBe('#2563eb');
      expect(mark.style.backgroundColor).toBe('');
    }
    expect(cellFor('CONC_l1')).not.toHaveStyle({
      backgroundColor: toBgColor('#2563eb', 0.12),
    });
    expect(cellFor('CONC_r1')).not.toHaveStyle({
      backgroundColor: toBgColor('#2563eb', 0.12),
    });
  });

  it('removes inline anchor highlights when toggled off but keeps matched text emphasized', () => {
    const { rerender } = render(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} />);

    expect(screen.getByText('before', { selector: 'mark' })).toHaveClass(
      'concordance-context-anchor',
    );
    expect(screen.getByText('alpha', { selector: 'td' })).toHaveStyle({
      backgroundColor: toBgColor('#2563eb', 0.24),
    });

    rerender(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} highlightL1R1={false} />);

    expect(screen.queryByText('before', { selector: 'mark' })).not.toBeInTheDocument();
    expect(screen.getByText('alpha', { selector: 'td' })).toHaveClass('font-semibold');
  });

  it.each([
    ['empty', '', ''],
    ['missing', 'missing', 'gone'],
  ])('leaves %s anchors unmarked', (_caseName, leftAnchor, rightAnchor) => {
    const fallbackData: ConcordanceNodeResult = {
      ...nodeData,
      data: [
        [
          {
            ...nodeData.data[0]![0]!,
            CONC_l1: leftAnchor,
            CONC_r1: rightAnchor,
            CONC_right_context: 'AFTER',
          },
        ],
      ],
    };
    render(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} nodeData={fallbackData} />);

    expect(screen.queryByText('before', { selector: 'mark' })).not.toBeInTheDocument();
    expect(screen.queryByText('AFTER', { selector: 'mark' })).not.toBeInTheDocument();
  });

  it('marks lowercased Tokens-mode anchors in their original case (issue 272)', () => {
    const tokensData: ConcordanceNodeResult = {
      ...nodeData,
      data: [
        [
          {
            ...nodeData.data[0]![0]!,
            CONC_l1: 'Before',
            CONC_r1: 'after',
            CONC_right_context: 'AFTER',
          },
        ],
      ],
    };
    render(<ConcordanceTableNodeBlock {...buildProps(vi.fn())} nodeData={tokensData} />);

    expect(screen.getByText('before', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByText('AFTER', { selector: 'mark' })).toBeInTheDocument();
  });

  it('uses the palette fallback for highlighted cells in combined tables', () => {
    const combinedData: ConcordanceNodeResult = {
      ...nodeData,
      data: [[{ ...nodeData.data[0]![0]!, __source_node: 'unknown source' }]],
    };
    render(
      <ConcordanceTableNodeBlock
        {...buildProps(vi.fn())}
        nodeKey={CONCORDANCE_COMBINED_NODE_KEY}
        nodeData={combinedData}
        panelSelectedNodes={[
          { id: 'node-1', name: 'Documents 1' } as WorkspaceNodeMetadata,
          { id: 'node-2', name: 'Documents 2' } as WorkspaceNodeMetadata,
        ]}
        sourceColorMap={{ 'node-1': '#2563eb', 'node-2': '#dc2626' }}
        defaultPalette={['#dc2626']}
      />,
    );

    const header = screen.getByTestId('concordance-table-combined-header');
    expect(header.style.backgroundColor).toBe('');
    expect(screen.getByTestId('concordance-source-chip-node-1')).toHaveStyle({
      backgroundColor: '#2563eb',
      color: foregroundForVizColor('#2563eb'),
    });
    expect(screen.getByTestId('concordance-source-chip-node-2')).toHaveStyle({
      backgroundColor: '#dc2626',
      color: foregroundForVizColor('#dc2626'),
    });
    expect(screen.getByText('alpha', { selector: 'td' })).toHaveStyle({
      backgroundColor: toBgColor('#dc2626', 0.24),
    });
    expect(
      screen
        .getByText('before', { selector: 'mark' })
        .style.getPropertyValue('--concordance-anchor-color'),
    ).toBe('#dc2626');
    expect(
      screen
        .getAllByRole('columnheader')
        .every((header) => !header.classList.contains('cursor-pointer')),
    ).toBe(true);
  });

  it('keeps headers and the current rows, dimmed and busy, while a new page or sort is processing (issue 209)', () => {
    const props = buildProps(vi.fn());
    render(<ConcordanceTableNodeBlock {...props} nodeLoading={{ 'node-1': true }} />);

    expect(screen.getByRole('columnheader', { name: 'CONC_matched_text' })).toBeInTheDocument();
    // Swapping the rows for a processing row shrank the table and scrolled it
    // back to the top; the rows stay, dimmed and unclickable, instead.
    const body = screen.getByRole('rowgroup', { busy: true });
    expect(body).toHaveClass('pointer-events-none', 'opacity-60');
    expect(within(body).getAllByRole('row')).toHaveLength(1);
    expect(
      screen.queryByRole('status', { name: 'Processing preview page' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
  });

  it('resets only the table row axis when paging', () => {
    const handlePageChange = vi.fn();
    const pagedNodeData: ConcordanceNodeResult = {
      ...nodeData,
      pagination: {
        ...nodeData.pagination,
        total_source_rows: 40,
        total_source_pages: 2,
        has_next: true,
      },
    };
    const { container } = render(
      <ConcordanceTableNodeBlock
        {...buildProps(vi.fn())}
        nodeData={pagedNodeData}
        handlePageChange={handlePageChange}
      />,
    );
    const viewport = container.querySelector<HTMLDivElement>(
      '[data-testid="analysis-table-scroll-area"] [data-slot="scroll-area-viewport"]',
    );
    expect(viewport).not.toBeNull();
    if (!viewport) return;
    viewport.scrollLeft = 180;
    viewport.scrollTop = 60;

    fireEvent.click(screen.getByRole('link', { name: 'Go to next page' }));

    expect(handlePageChange).toHaveBeenCalledWith(2, 'node-1', 'node-1');
    expect(viewport.scrollLeft).toBe(180);
    expect(viewport.scrollTop).toBe(0);
  });
});
