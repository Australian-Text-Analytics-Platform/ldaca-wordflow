import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  { name: 'party', kind: 'text', typeLabel: 'category' },
  { name: 'speaker', kind: 'text' },
  { name: 'sitting', kind: 'boolean' },
  { name: 'year', kind: 'number' },
  { name: 'date', kind: 'date' },
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
      // A number column is grouped into ranges, so it shows no number of values.
      { value: 'year' },
      { value: 'date' },
      { value: 'start' },
    ]);
  });

  it('offers every supported column while the numbers of values are not known', () => {
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

    expect(await screen.findByRole('option', { name: 'party (4 values)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'year' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^speaker/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^text/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
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
