import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Utf8 } from 'apache-arrow';
import { expect, it } from 'vitest';
import { PlotParameters } from './PlotParameters';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import type { PlotRequest } from '@/features/project/api';

function Harness() {
  const [draft, setDraft] = useState<PlotRequest>({
    ...decodeAnalysisRequest('trends', undefined).request,
    groups: ['party', 'speaker', ''],
  });
  return (
    <>
      <PlotParameters
        base="http://test"
        active={false}
        draft={draft}
        fields={['party', 'speaker', 'region'].map((name) => new Field(name, new Utf8(), true))}
        onChange={setDraft}
      />
      <output data-testid="request">{JSON.stringify(draft)}</output>
    </>
  );
}
it('removes any grouping row, preserves the other choices and permits adding again', async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Remove group 2' }));
  expect(JSON.parse(screen.getByTestId('request').textContent ?? '{}').groups).toEqual([
    'party',
    '',
  ]);
  await user.click(screen.getByRole('button', { name: 'Remove group 2' }));
  await user.click(screen.getByRole('button', { name: 'Add group' }));
  await user.click(screen.getByRole('combobox', { name: 'Group 2' }));
  expect(screen.queryByRole('option', { name: 'party' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('option', { name: 'region' }));
  expect(JSON.parse(screen.getByTestId('request').textContent ?? '{}').groups).toEqual([
    'party',
    'region',
  ]);
  await user.click(screen.getByRole('button', { name: 'Remove group 1' }));
  await user.click(screen.getByRole('button', { name: 'Remove group 1' }));
  expect(screen.queryByRole('combobox', { name: 'Group 1' })).not.toBeInTheDocument();
});
