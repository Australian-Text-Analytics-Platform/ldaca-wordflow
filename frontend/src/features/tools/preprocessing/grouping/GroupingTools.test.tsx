import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Utf8 } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { GroupTool } from './GroupingTools';
const api = vi.hoisted(() => ({ querySql: vi.fn(), createViews: vi.fn() }));
vi.mock('@/features/project/api', async (original) => ({ ...(await original()), ...api }));
vi.mock('../hooks/usePreprocessingPreview', () => ({
  usePreprocessingPreview: () => ({ data: [], columns: [], ready: false }),
}));
beforeEach(() => {
  vi.resetAllMocks();
});
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GroupTool
        base="project"
        source="source"
        columns={[{ name: 'category', field: new Field('category', new Utf8()) }]}
        existingNames={[]}
        active
        inputs={null}
        suggested="source_grp_1"
      />
    </QueryClientProvider>,
  );
}
it('initially selects every group and creates the selected live Views atomically', async () => {
  api.querySql.mockResolvedValue([
    { value: 'A', rows: '3' },
    { value: null, rows: '2' },
  ]);
  api.createViews
    .mockRejectedValueOnce(new Error('second View failed'))
    .mockResolvedValueOnce(['source · A', 'source · (empty)']);
  mount();
  expect(await screen.findByRole('checkbox', { name: 'A — 3 rows' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: '(empty) — 2 rows' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Create 2 Data Blocks' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('second View failed'));
  expect(api.createViews).toHaveBeenCalledTimes(1);
  expect(api.createViews.mock.calls[0]?.[1]).toHaveLength(2);
  expect(api.createViews.mock.calls[0]?.[1][1].sql).toContain('IS NOT DISTINCT FROM NULL');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Created source · A');
});
it('requires narrowing when there are more than 50 groups', async () => {
  api.querySql.mockResolvedValue(
    Array.from({ length: 51 }, (_, n) => ({ value: String(n), rows: '1' })),
  );
  mount();
  expect(await screen.findByRole('status')).toHaveTextContent('More than 50 groups');
  expect(screen.getByRole('button', { name: 'Create 51 Data Blocks' })).toBeDisabled();
  expect(api.createViews).not.toHaveBeenCalled();
});
