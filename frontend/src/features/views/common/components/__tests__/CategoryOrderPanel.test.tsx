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
  max_values: 50,
  max_custom_values: 12,
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

  it('lets values be dragged only up to 12, with no Custom button', async () => {
    const labels = Array.from({ length: 13 }, (_value, index) => `v${String(index)}`);
    vi.mocked(getCategoryValues).mockResolvedValue({
      data: values({ labels, counts: labels.map(() => 1) }),
    } as never);
    showPanel();

    expect(
      await screen.findByText(/Values can be dragged when there are up to 12/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Custom' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Press Space to move/ })).not.toBeInTheDocument();
  });

  it('shows why a column cannot become a category', async () => {
    vi.mocked(getCategoryValues).mockRejectedValue(
      new Error('"answer" has 80 different values. A category column can have at most 50.'),
    );
    showPanel();

    expect(await screen.findByText(/at most 50/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Convert' })).not.toBeInTheDocument();
  });
});
