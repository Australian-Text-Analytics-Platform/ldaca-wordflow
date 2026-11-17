import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  applyReferenceComparisonEdit,
  type ConfusionCount,
  calculateCohensKappa,
  calculateKrippendorffsAlpha,
  calculatePercentAgreement,
} from '@/features/views/common/columnComparisonModel';
import { ColumnComparisonHeader, ColumnComparisonSelector } from '../ColumnComparison';

const rows: ConfusionCount[] = [
  { reference: 'covid', comparison: 'covid', count: 3 },
  { reference: 'covid', comparison: 'job', count: 1 },
  { reference: 'job', comparison: 'covid', count: 1 },
  { reference: 'job', comparison: 'job', count: 3 },
];

describe('ColumnComparison', () => {
  it('calculates chance-corrected intercoder agreement from matrix counts', () => {
    expect(calculatePercentAgreement(rows)).toBe(0.75);
    expect(calculateCohensKappa(rows)).toBe(0.5);
    expect(calculateKrippendorffsAlpha(rows)).toBe(0.53125);
    expect(
      calculateCohensKappa([
        { reference: 'covid', comparison: 'covid', count: 2 },
        { reference: 'job', comparison: 'job', count: 2 },
      ]),
    ).toBe(1);
    expect(
      calculateCohensKappa([{ reference: 'covid', comparison: 'covid', count: 4 }]),
    ).toBeNull();
  });

  it('updates aggregate pairs for one persisted reference edit', () => {
    expect(
      applyReferenceComparisonEdit(rows, {
        previousReference: 'covid',
        nextReference: 'job',
        comparison: 'covid',
      }),
    ).toEqual([
      { reference: 'covid', comparison: 'covid', count: 2 },
      { reference: 'covid', comparison: 'job', count: 1 },
      { reference: 'job', comparison: 'covid', count: 2 },
      { reference: 'job', comparison: 'job', count: 3 },
    ]);
    expect(
      applyReferenceComparisonEdit([{ reference: '', comparison: 'covid', count: 1 }], {
        previousReference: '',
        nextReference: null,
        comparison: 'covid',
      }),
    ).toEqual([]);
    expect(
      applyReferenceComparisonEdit(rows, {
        previousReference: 'covid',
        nextReference: 'job',
        comparison: null,
      }),
    ).toBe(rows);
  });

  it('names the method and shades the matrix by scale distance on an ordered scale', async () => {
    const user = userEvent.setup();
    const scaleRows = [
      { reference: 'Low', comparison: 'Low', count: 4 },
      { reference: 'Low', comparison: 'Medium', count: 1 },
      { reference: 'Low', comparison: 'High', count: 1 },
      { reference: 'High', comparison: 'Not applicable', count: 1 },
    ];
    render(
      <ColumnComparisonHeader
        metric="cohens_kappa"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={scaleRows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
        scale={{ levels: ['Low', 'Medium', 'High'], outside: ['Not applicable'] }}
      />,
    );

    const score = screen.getByRole('button', { name: /Cohen’s Kappa \(weighted\)/ });
    expect(score).toHaveTextContent(/^κw /);
    await user.hover(score);

    const [method] = await screen.findAllByTestId('reliability-method');
    expect(method).toHaveTextContent(
      'Weighted Cohen’s Kappa on an ordered scale: a near miss counts as partial agreement',
    );
    expect(screen.getAllByTestId('reliability-shading-key')[0]).toBeVisible();
    const [matrix] = screen.getAllByRole('table', {
      name: 'annotation versus review confusion matrix',
    });
    if (!matrix) throw new Error('Expected a confusion matrix.');
    // Levels in scale order, then the code outside the scale.
    expect(
      within(matrix)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Row label', 'Low', 'Medium', 'High', 'Not applicable']);
    const lowRow = within(matrix).getByRole('row', { name: /^Low/ });
    const [same, near, far, outside] = within(lowRow).getAllByRole('cell');
    const shade = (cell: HTMLElement | undefined) => cell?.getAttribute('style') ?? '';
    expect(shade(same)).toContain('--color-chart-3');
    expect(shade(near)).toContain('36%');
    expect(shade(far)).toContain('60%');
    expect(shade(outside)).toContain('60%');
  });

  it('says a categorical score counts only exact matches, with agreement in green', async () => {
    const user = userEvent.setup();
    render(
      <ColumnComparisonHeader
        metric="krippendorffs_alpha"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
      />,
    );
    await user.hover(screen.getByRole('button', { name: /Krippendorff’s Alpha/ }));
    const [method] = await screen.findAllByTestId('reliability-method');
    expect(method).toHaveTextContent(
      'Krippendorff’s Alpha on categories: only exact matches agree.',
    );
    // Agreement is green; disagreements stay plain, with no scale to measure them on.
    const [key] = screen.getAllByTestId('reliability-shading-key');
    expect(key).toHaveTextContent('Green: both columns agree.');
    expect(key).not.toHaveTextContent('Orange');
    const [matrix] = screen.getAllByRole('table', {
      name: 'annotation versus review confusion matrix',
    });
    if (!matrix) throw new Error('Expected a confusion matrix.');
    const shaded = (token: string) =>
      within(matrix)
        .getAllByRole('cell')
        .filter((cell) => cell.getAttribute('style')?.includes(token));
    expect(shaded('--color-chart-3')).toHaveLength(2);
    expect(shaded('--color-chart-4')).toHaveLength(0);
  });

  it('stacks Cohen’s Kappa above the column name and shows plain matrix counts on hover', async () => {
    const user = userEvent.setup();
    render(
      <ColumnComparisonHeader
        label="review"
        metric="cohens_kappa"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
      />,
    );

    const score = screen.getByRole('button', {
      name: 'Cohen’s Kappa 0.500 for annotation versus review',
    });
    expect(screen.getByText('review')).toBeVisible();
    expect(score).toBeVisible();
    expect(score).toHaveClass('h-7', 'px-2.5', 'text-body');
    expect(score.compareDocumentPosition(screen.getByText('review'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.hover(score);

    const [matrix] = await screen.findAllByRole('table', {
      name: 'annotation versus review confusion matrix',
    });
    expect(matrix).toBeDefined();
    if (!matrix) throw new Error('Expected a confusion matrix in the reliability tooltip.');
    const [columnAxis] = screen.getAllByLabelText('review column axis');
    const [rowAxis] = screen.getAllByLabelText('annotation row axis');
    expect(columnAxis).toBeVisible();
    expect(columnAxis).toHaveTextContent('review');
    expect(rowAxis).toBeVisible();
    if (!rowAxis) throw new Error('Expected an annotation row axis.');
    expect(rowAxis).toHaveTextContent('annotation');
    expect(within(rowAxis).getByText('annotation')).toHaveClass(
      'rotate-180',
      '[writing-mode:vertical-rl]',
    );
    expect(screen.queryByText('annotation ↓ / review →')).not.toBeInTheDocument();
    const matrixRows = within(matrix).getAllByRole('row');

    expect(within(matrix).getByRole('columnheader', { name: 'covid' })).toHaveClass(
      'text-widget-foreground/80',
    );
    expect(within(matrix).getByRole('rowheader', { name: 'job' })).toHaveClass(
      'text-widget-foreground/80',
    );
    expect(
      within(matrixRows[1])
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['3', '1']);
    expect(
      within(matrixRows[2])
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1', '3']);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('formats the selected reliability metric with its conventional sign', () => {
    const { rerender } = render(
      <ColumnComparisonHeader
        metric="percent_agreement"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Percent Agreement 75.0% for annotation versus review',
      }),
    ).toHaveTextContent('75.0%');

    rerender(
      <ColumnComparisonHeader
        metric="krippendorffs_alpha"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Krippendorff’s Alpha 0.531 for annotation versus review',
      }),
    ).toHaveTextContent('α 0.531');
  });

  it('opens the row-filter menu from the header and reports its active state', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const { rerender } = render(
      <ColumnComparisonHeader
        metric="cohens_kappa"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
        filter={{ differs: false, existence: 'off' }}
        onFilterChange={onFilterChange}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Filter rows by review' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle.textContent).toBe('');
    await user.click(toggle);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Differs from annotation' }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ differs: true, existence: 'off' });
    await user.click(screen.getByRole('menuitemradio', { name: 'Has value' }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ differs: false, existence: 'present' });
    await user.keyboard('{Escape}');

    rerender(
      <ColumnComparisonHeader
        metric="cohens_kappa"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed
        onRevealedChange={vi.fn()}
        filter={{ differs: true, existence: 'present' }}
        onFilterChange={onFilterChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Filter rows by review' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps reliability and filtering available while the comparison is masked', async () => {
    const user = userEvent.setup();
    const onRevealedChange = vi.fn();
    render(
      <ColumnComparisonHeader
        metric="cohens_kappa"
        referenceColumn="annotation"
        comparisonColumn="review"
        rows={rows}
        isLoading={false}
        isError={false}
        revealed={false}
        onRevealedChange={onRevealedChange}
        filter={{ differs: false, existence: 'off' }}
        onFilterChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Cohen’s Kappa 0.500 for annotation versus review' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filter rows by review' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Show comparison values for review' }));
    expect(onRevealedChange).toHaveBeenCalledWith(true);
  });

  it('offers all reliability metrics above the comparison checklist', async () => {
    const user = userEvent.setup();
    const onMetricChange = vi.fn();
    render(
      <ColumnComparisonSelector
        availableColumns={['review']}
        selectedColumns={[]}
        onSelectedColumnsChange={vi.fn()}
        metric="cohens_kappa"
        onMetricChange={onMetricChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Compare to' }));

    const reliabilityOptions = screen.getAllByRole('menuitemradio');
    expect(reliabilityOptions.map((option) => option.textContent)).toEqual([
      'Percent Agreement',
      'Cohen’s Kappa',
      'Krippendorff’s Alpha',
    ]);
    expect(screen.getByRole('menuitemcheckbox', { name: 'review' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitemradio', { name: 'Krippendorff’s Alpha' }));
    expect(onMetricChange).toHaveBeenCalledWith('krippendorffs_alpha');
  });

  it('disables opposite-role columns and skips them when selecting all', async () => {
    const user = userEvent.setup();
    const onSelectedColumnsChange = vi.fn();
    render(
      <ColumnComparisonSelector
        availableColumns={['review', 'username']}
        selectedColumns={[]}
        onSelectedColumnsChange={onSelectedColumnsChange}
        metric="cohens_kappa"
        onMetricChange={vi.fn()}
        disabledColumns={['username']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Compare to' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'username' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Select all' }));
    expect(onSelectedColumnsChange).toHaveBeenCalledWith(['review']);
  });

  it('explains Compare to on hover, and says why it waits without columns', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ColumnComparisonSelector
        availableColumns={['review']}
        selectedColumns={[]}
        onSelectedColumnsChange={vi.fn()}
        metric="cohens_kappa"
        onMetricChange={vi.fn()}
      />,
    );
    await user.hover(screen.getByRole('button', { name: 'Compare to' }));
    expect(
      (await screen.findAllByText(/Compare this column with other coders or models/))[0],
    ).toBeInTheDocument();

    rerender(
      <ColumnComparisonSelector
        availableColumns={[]}
        selectedColumns={[]}
        onSelectedColumnsChange={vi.fn()}
        metric="cohens_kappa"
        onMetricChange={vi.fn()}
      />,
    );
    // The disabled button's wrapper takes focus and shows why it waits.
    await user.tab();
    expect(
      (await screen.findAllByText('There are no other columns to compare with.'))[0],
    ).toBeInTheDocument();
  });
  describe('says which columns do not match the codebook (issue 498)', () => {
    const renderHeader = (
      rows: ConfusionCount[],
      codebookFit: Parameters<typeof ColumnComparisonHeader>[0]['codebookFit'],
    ) =>
      render(
        <ColumnComparisonHeader
          metric="cohens_kappa"
          referenceColumn="job.gemini25"
          comparisonColumn="Job_AI"
          rows={rows}
          isLoading={false}
          isError={false}
          revealed={false}
          onRevealedChange={vi.fn()}
          codebookFit={codebookFit}
        />,
      );
    const openTooltip = async () => {
      const user = userEvent.setup();
      await user.hover(screen.getByRole('button', { name: /Cohen’s Kappa/ }));
      await screen.findAllByTestId('reliability-method');
    };

    it('names a comparison column with no codes instead of blaming empty rows', async () => {
      renderHeader([], {
        reference: { filled: 30, notCodes: 0, examples: [] },
        comparison: { filled: 30, notCodes: 30, examples: ['Other'] },
      });
      expect(screen.getByText('No codes from this codebook')).toBeInTheDocument();
      await openTooltip();

      expect(screen.getAllByTestId('codebook-fit-note')[0]).toHaveTextContent(
        'None of the values in Job_AI are codes in the selected codebook (for example “Other”), so Job_AI is left out of this score. Check the codebook.',
      );
      expect(screen.queryByText('No rows contain values in both columns.')).not.toBeInTheDocument();
    });

    it('says an annotation column with no codes affects every score', async () => {
      renderHeader([], {
        reference: { filled: 30, notCodes: 30, examples: ['Promise'] },
        comparison: { filled: 30, notCodes: 0, examples: [] },
      });
      await openTooltip();

      expect(screen.getAllByTestId('codebook-fit-note')[0]).toHaveTextContent(
        'so job.gemini25 is left out of every score, since all of them compare against it.',
      );
    });

    it('keeps the empty-rows wording when a column is just empty', async () => {
      renderHeader([], {
        reference: { filled: 30, notCodes: 0, examples: [] },
        comparison: { filled: 0, notCodes: 0, examples: [] },
      });
      await openTooltip();

      expect(screen.queryByTestId('codebook-fit-note')).not.toBeInTheDocument();
      expect(
        (await screen.findAllByText('No rows contain values in both columns.'))[0],
      ).toBeInTheDocument();
    });

    it('shows the score and how many values were left out when some are not codes', async () => {
      renderHeader(rows, {
        reference: { filled: 30, notCodes: 0, examples: [] },
        comparison: { filled: 30, notCodes: 12, examples: ['Other'] },
      });
      expect(screen.getByRole('button', { name: /Cohen’s Kappa/ })).toHaveTextContent('κ 0.500');
      await openTooltip();

      expect(screen.getAllByTestId('codebook-fit-note')[0]).toHaveTextContent(
        '12 values in Job_AI are not codes in the selected codebook and were left out.',
      );
      expect(screen.queryByText('No codes from this codebook')).not.toBeInTheDocument();
    });
  });
});
