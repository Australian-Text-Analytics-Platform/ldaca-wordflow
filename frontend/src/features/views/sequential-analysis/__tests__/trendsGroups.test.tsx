import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryWorkspaceSqlTable } from '@/api';
import { UniqueValueCount } from '../components/UniqueValueCount';
import { countResultGroups, MAX_TRENDS_GROUPS } from '../trendsGroups';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
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

  it('flags a group column with more values than Trends can draw', async () => {
    vi.mocked(queryWorkspaceSqlTable).mockResolvedValue({
      rows: [{ unique_count: 245_428, has_null: false }],
    } as never);
    showCount();
    expect(
      await screen.findByText(
        `245,428 unique: too many groups (at most ${MAX_TRENDS_GROUPS.toLocaleString()})`,
      ),
    ).toBeInTheDocument();
  });

  it('shows an ordinary count plainly', async () => {
    vi.mocked(queryWorkspaceSqlTable).mockResolvedValue({
      rows: [{ unique_count: 12, has_null: true }],
    } as never);
    showCount();
    expect(await screen.findByText('12 unique + null')).toBeInTheDocument();
  });
});
