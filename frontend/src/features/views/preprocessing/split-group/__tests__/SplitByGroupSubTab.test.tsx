import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateDay, Field, Int64, Utf8 } from 'apache-arrow';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDistinctValueColumns } from '@/api';
import type { BuilderInput } from '../../builder/builderTypes';
import { SplitByGroupSubTab } from '../SplitByGroupSubTab';
import { groupColumnOptions, groupsByValues, MAX_GROUPS } from '../splitGroups';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getDistinctValueColumns: vi.fn(),
}));
// The help icon needs the app's TooltipProvider; its text is checked below.
vi.mock('@/components/help/HelpIcon', () => ({
  default: ({ label, tooltip }: { label?: string; tooltip?: string }) => (
    <button type="button" aria-label={label} title={tooltip} />
  ),
}));
vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ createDerivedNode: vi.fn() }),
}));
vi.mock('../../builder/BuilderToolCard', () => ({
  BuilderToolCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../builder/useBuilderSql', () => ({
  useBuilderSql: () => ({ data: undefined, error: null }),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const columns: BuilderInput['columns'] = [
  { name: 'text', kind: 'text' },
  { name: 'party', kind: 'text', typeLabel: 'text', field: new Field('party', new Utf8()) },
  { name: 'speaker', kind: 'text' },
  { name: 'sitting', kind: 'boolean' },
  {
    name: 'year',
    kind: 'number',
    typeLabel: 'whole number',
    field: new Field('year', new Int64()),
  },
  { name: 'date', kind: 'date', typeLabel: 'date', field: new Field('date', new DateDay()) },
  { name: 'start', kind: 'elapsed' },
  { name: 'tokens', kind: 'other' },
];

const renderTool = (inputColumns: BuilderInput['columns']) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SplitByGroupSubTab
        input={{ id: 'node-1', name: 'speeches', column: 'text', columns: inputColumns }}
        workspaceId="workspace-1"
        onAlert={vi.fn()}
      />
    </QueryClientProvider>,
  );

const listed = (found: Record<string, number>) => {
  vi.mocked(getDistinctValueColumns).mockResolvedValue({
    data: {
      max_distinct: MAX_GROUPS,
      columns: Object.entries(found).map(([name, distinct_values]) => ({
        name,
        distinct_values,
      })),
    },
  } as never);
};

describe('Group: columns offered under Split by', () => {
  beforeEach(() => {
    vi.mocked(getDistinctValueColumns).mockReset();
  });

  it('groups text, category and true/false columns by their values', () => {
    expect(['text', 'boolean', 'number', 'date', 'elapsed', 'other'].map(groupsByValues)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('offers value columns only with few enough values, and ranges and periods always', () => {
    expect(groupColumnOptions(columns, { party: 4, sitting: 1, year: 30 })).toEqual([
      { value: 'party', label: 'party (4 values)' },
      { value: 'sitting', label: 'sitting (1 value)' },
      // Grouped into ranges or periods, whatever the number of values: the
      // picker's type symbol tells them apart, so they keep their plain names.
      { value: 'year' },
      { value: 'date' },
      { value: 'start' },
    ]);
    // Counted, and nothing fits: only the range and period columns are left.
    expect(groupColumnOptions(columns, {}).map((option) => option.value)).toEqual([
      'year',
      'date',
      'start',
    ]);
  });

  it('offers every supported column if the numbers of values could not be read', () => {
    expect(groupColumnOptions(columns, undefined).map((option) => option.value)).toEqual([
      'text',
      'party',
      'speaker',
      'sitting',
      'year',
      'date',
      'start',
    ]);
  });

  it('asks for columns with up to 50 values and lists them with that number', async () => {
    const user = userEvent.setup();
    listed({ party: 4 });
    renderTool(columns);

    const picker = screen.getByRole('combobox', { name: 'Split by column' });
    await screen.findByRole('combobox', { name: 'Split by column' });
    await vi.waitFor(() => {
      expect(getDistinctValueColumns).toHaveBeenCalledWith({
        path: { workspace_id: 'workspace-1', node_id: 'node-1' },
        query: { max_distinct: 50 },
        throwOnError: true,
      });
    });
    await user.click(picker);

    // Each column starts with the Data Editor's symbol for its type, whose
    // name is read out after the column's and shows on hover.
    const party = await screen.findByRole('option', { name: 'party (4 values), text' });
    expect(within(party).getByTitle('text')).toHaveTextContent('Aa');
    const year = screen.getByRole('option', { name: 'year, whole number' });
    expect(within(year).getByTitle('whole number')).toHaveTextContent('123');
    expect(screen.getByRole('option', { name: 'date, date' })).toBeInTheDocument();
    // No symbol is known for this column in the test, so it shows its name only.
    expect(screen.getByRole('option', { name: 'start' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);

    // The chosen column keeps its symbol in the closed picker.
    await user.click(year);
    expect(within(picker).getByTitle('whole number')).toHaveTextContent('123');
    expect(picker).toHaveTextContent('year');
    expect(screen.queryByRole('option', { name: /^speaker/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^text/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('holds text columns back until their values are counted', async () => {
    const user = userEvent.setup();
    vi.mocked(getDistinctValueColumns).mockReturnValue(new Promise(() => undefined) as never);
    renderTool(columns);

    await user.click(screen.getByRole('combobox', { name: 'Split by column' }));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '123year, whole number',
      'date, date',
      'start',
    ]);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains the limit beside Split by, on the same row as the picker', () => {
    listed({ party: 4 });
    renderTool(columns);

    const row = within(screen.getByRole('group', { name: 'Split by' }));
    expect(row.getByText('Split by')).toBeInTheDocument();
    expect(
      row.getByRole('button', { name: 'About the columns listed under Split by' }),
    ).toHaveAttribute(
      'title',
      'Text and category columns are listed only when they have 50 or fewer different values, because each value becomes a Data Block. Number and time columns are always listed: they are grouped into ranges or periods.',
    );
    expect(row.getByRole('combobox', { name: 'Split by column' })).toBeInTheDocument();
  });

  it('says so when no column can be grouped', async () => {
    listed({});
    renderTool([
      { name: 'text', kind: 'text' },
      { name: 'speaker', kind: 'text' },
      { name: 'tokens', kind: 'other' },
    ]);

    expect(await screen.findByRole('note')).toHaveTextContent(
      'No column in this Data Block has 50 or fewer different values, so there is nothing to group by.',
    );
    expect(screen.getByRole('combobox', { name: 'Split by column' })).toBeDisabled();
  });

  it('keeps every column on offer if the numbers of values cannot be read', async () => {
    const user = userEvent.setup();
    vi.mocked(getDistinctValueColumns).mockRejectedValue(new Error('offline'));
    renderTool(columns);

    await vi.waitFor(() => {
      expect(getDistinctValueColumns).toHaveBeenCalled();
    });
    await user.click(screen.getByRole('combobox', { name: 'Split by column' }));

    expect(await screen.findByRole('option', { name: 'speaker' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
