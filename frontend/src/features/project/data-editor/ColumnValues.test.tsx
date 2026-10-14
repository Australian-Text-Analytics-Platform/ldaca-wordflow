import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tableFromArrays } from 'apache-arrow';
import { useState } from 'react';
import { expect, it, vi } from 'vite-plus/test';
import { ColumnValues } from './ColumnValues';
import { initialEditorDraft } from './expressions';

const api = vi.hoisted(() => ({ querySql: vi.fn() }));
vi.mock('@/features/project/api', () => api);
function Harness() {
  const [draft, setDraft] = useState(initialEditorDraft('value'));
  return (
    <>
      <ColumnValues
        base="project"
        target="source"
        draft={draft}
        ordering={false}
        category={false}
        onChange={(patch) => setDraft({ ...draft, ...patch })}
      />
      <output data-testid="mappings">{JSON.stringify(draft.mappings)}</output>
    </>
  );
}
it('searches beyond 500 values and distinguishes empty output, Set missing and Reset across pages', async () => {
  const labels = [null, '', ' ', ...Array.from({ length: 601 }, (_, i) => `value ${i}`)];
  api.querySql.mockResolvedValue(
    tableFromArrays({
      value_key: labels.map((value) => (value === null ? null : JSON.stringify(value))),
      label: labels,
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>,
  );
  await screen.findByText('604 values · page 1');
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Map Empty text'), 'changed');
  await user.clear(screen.getByLabelText('Map Empty text'));
  expect(screen.getByTestId('mappings')).toHaveTextContent('"value":""');
  await user.click(screen.getAllByRole('button', { name: 'Set missing' })[1]!);
  expect(screen.getByTestId('mappings')).toHaveTextContent('"value":null');
  await user.click(screen.getAllByRole('button', { name: 'Reset' })[1]!);
  expect(screen.getByTestId('mappings')).toHaveTextContent('[]');
  await user.type(screen.getByLabelText('Search values'), 'value 600');
  await waitFor(() => expect(screen.getByLabelText('Map value 600')).toBeVisible());
  await user.type(screen.getByLabelText('Map value 600'), 'tail');
  expect(screen.getByTestId('mappings')).toHaveTextContent('tail');
});
