import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDistinctValueColumns, queryWorkspaceSqlTable } from '@/api';
import { UniqueValueCount } from '../components/UniqueValueCount';
import { countResultGroups, groupColumnsQuery, MAX_TRENDS_GROUP_VALUES } from '../trendsGroups';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getDistinctValueColumns: vi.fn(),
  queryWorkspaceSqlTable: vi.fn(),
}));

const showCount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UniqueValueCount workspaceId="w" nodeId="n" columnName="IntonationUnit" />
    </QueryClientProvider>,
  );

describe('Trends group limit (issue 326)', () => {
  beforeEach(() => {
    vi.mocked(queryWorkspaceSqlTable).mockReset();
  });

  it('counts a result’s groups by their index', () => {
    expect(
      countResultGroups([
        { group_index: 0, period_index: 0 },
        { group_index: 1, period_index: 0 },
        { group_index: 0, period_index: 1 },
      ]),
    ).toBe(2);
    expect(countResultGroups([])).toBe(0);
  });

  it('flags a group column with more values than a group column may have', async () => {
    vi.mocked(queryWorkspaceSqlTable).mockResolvedValue({
      rows: [{ unique_count: 245_428, has_null: false }],
    } as never);
    showCount();
    expect(
      await screen.findByText('245,428 unique: too many groups (at most 16)'),
    ).toBeInTheDocument();
  });

  it('flags one value over the limit and not the limit itself', async () => {
    vi.mocked(queryWorkspaceSqlTable).mockResolvedValue({
      rows: [{ unique_count: MAX_TRENDS_GROUP_VALUES + 1, has_null: false }],
    } as never);
    const { unmount } = showCount();
    expect(await screen.findByText('17 unique: too many groups (at most 16)')).toBeInTheDocument();
    unmount();

    vi.mocked(queryWorkspaceSqlTable).mockResolvedValue({
      rows: [{ unique_count: MAX_TRENDS_GROUP_VALUES, has_null: false }],
    } as never);
    showCount();
    expect(await screen.findByText('16 unique')).toBeInTheDocument();
  });

  it('shows an ordinary count plainly', async () => {
    vi.mocked(queryWorkspaceSqlTable).mockResolvedValue({
      rows: [{ unique_count: 12, has_null: true }],
    } as never);
    showCount();
    expect(await screen.findByText('12 unique + null')).toBeInTheDocument();
  });

  it('asks the Data Block for its columns with up to 16 different values', async () => {
    vi.mocked(getDistinctValueColumns).mockResolvedValue({
      data: {
        max_distinct: 16,
        columns: [
          { name: 'speaker', distinct_values: 12 },
          { name: 'party', distinct_values: 1 },
        ],
      },
    } as never);

    const query = groupColumnsQuery('w', 'n');

    expect(query.enabled).toBe(true);
    expect(groupColumnsQuery('w', '').enabled).toBe(false);
    await expect(query.queryFn()).resolves.toEqual({ speaker: 12, party: 1 });
    expect(getDistinctValueColumns).toHaveBeenCalledWith({
      path: { workspace_id: 'w', node_id: 'n' },
      query: { max_distinct: 16 },
      throwOnError: true,
    });
  });
});
