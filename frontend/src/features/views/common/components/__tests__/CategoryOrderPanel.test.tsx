import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getCategoryValues, type CategoryValuesResource } from '@/api';
import { CategoryOrderPanel } from '../CategoryOrderPanel';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getCategoryValues: vi.fn(),
}));

const values = (overrides: Partial<CategoryValuesResource> = {}): CategoryValuesResource => ({
  column: 'answer',
  kind: 'text',
  labels: ['Agree', 'Disagree', 'Neutral'],
  counts: [5, 2, 3],
  empty_count: 4,
  is_ordered: false,
  warn_values: 150,
  max_values: 10000,
  complete: true,
  sample_rows: 0,
  sample_distinct: 0,
  is_document: false,
  ...overrides,
});

const showPanel = (onConfirm: Mock = vi.fn(), isCategory = false) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CategoryOrderPanel
        open
        workspaceId="w"
        nodeId="n"
        columnName="answer"
        isCategory={isCategory}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>,
  );
  return onConfirm;
};

const listed = () =>
  within(screen.getByRole('list', { name: 'Values in order' }))
    .getAllByText(/./, { selector: 'li > span:first-of-type, li > span.italic' })
    .map((item) => item.textContent);

describe('CategoryOrderPanel (issue 318)', () => {
  beforeEach(() => {
    vi.mocked(getCategoryValues).mockReset();
  });

  it('lists values A to Z with empty fixed last, and converts in the order shown', async () => {
    vi.mocked(getCategoryValues).mockResolvedValue({ data: values() } as never);
    const onConfirm = showPanel();

    await screen.findByRole('list', { name: 'Values in order' });
    expect(listed()).toEqual(['Agree', 'Disagree', 'Neutral', 'empty (always last)']);

    await userEvent.click(screen.getByRole('radio', { name: 'Z to A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith(['Neutral', 'Disagree', 'Agree']);
  });

  it('offers smallest and largest first for numbers and dates', async () => {
    vi.mocked(getCategoryValues).mockResolvedValue({
      data: values({ kind: 'value', labels: ['1', '9', '10'], counts: [1, 1, 1], empty_count: 0 }),
    } as never);
    showPanel();

    expect(await screen.findByRole('radio', { name: 'Smallest first' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Largest first' })).toBeInTheDocument();
    expect(screen.queryByText(/empty \(always last\)/)).not.toBeInTheDocument();
  });

  it('starts an ordered category from its current order', async () => {
    vi.mocked(getCategoryValues).mockResolvedValue({
      data: values({ labels: ['Disagree', 'Neutral', 'Agree'], is_ordered: true }),
    } as never);
    const onConfirm = showPanel(vi.fn(), true);

    expect(await screen.findByRole('radio', { name: 'Current order' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Apply order' }));
    expect(onConfirm).toHaveBeenCalledWith(['Disagree', 'Neutral', 'Agree']);
  });

  it('orders by rows, most or fewest first, keeping A to Z for ties', async () => {
    vi.mocked(getCategoryValues).mockResolvedValue({
      data: values({ counts: [5, 2, 5] }),
    } as never);
    const onConfirm = showPanel();

    await userEvent.click(await screen.findByRole('radio', { name: 'Most rows first' }));
    expect(listed()).toEqual(['Agree', 'Neutral', 'Disagree', 'empty (always last)']);
    await userEvent.click(screen.getByRole('radio', { name: 'Fewest rows first' }));
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith(['Disagree', 'Agree', 'Neutral']);
  });

  it('warns above 150 values and lists them all after Continue, all draggable', async () => {
    const labels = Array.from({ length: 151 }, (_value, index) => `v${String(index)}`);
    vi.mocked(getCategoryValues).mockResolvedValue({
      data: values({ labels, counts: labels.map(() => 1) }),
    } as never);
    showPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('151 different values');
    expect(screen.queryByRole('list', { name: 'Values in order' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getAllByRole('button', { name: /Press Space to move/ })).toHaveLength(151);
    expect(screen.queryByRole('radio', { name: 'Custom' })).not.toBeInTheDocument();
  });

  it('asks before reading a whole column that looks like text, then lists it', async () => {
    vi.mocked(getCategoryValues)
      .mockResolvedValueOnce({
        data: values({
          labels: [],
          counts: [],
          complete: false,
          sample_rows: 10000,
          sample_distinct: 9876,
          is_document: true,
        }),
      } as never)
      .mockResolvedValueOnce({
        data: values({ labels: ['a', 'b'], counts: [1, 1] }),
      } as never);
    showPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /document column.*first 10,000 rows already have 9,876 different values/,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('list', { name: 'Values in order' })).toBeInTheDocument();
    expect(vi.mocked(getCategoryValues).mock.calls.map((call) => call[0].query)).toEqual([
      { column: 'answer', read_all: false },
      { column: 'answer', read_all: true },
    ]);
  });

  it('shows why a column cannot become a category', async () => {
    vi.mocked(getCategoryValues).mockRejectedValue(
      new Error('"answer" has 20,000 different values. A category column can have at most 10,000.'),
    );
    showPanel();

    expect(await screen.findByText(/at most 10,000/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Convert' })).not.toBeInTheDocument();
  });
});
