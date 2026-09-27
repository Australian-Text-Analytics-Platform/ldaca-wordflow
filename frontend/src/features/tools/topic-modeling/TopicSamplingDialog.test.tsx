import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { TopicSamplingDialog } from './TopicSamplingDialog';
it('captures both current sample sizes on confirmation without requiring blur', async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  const close = vi.fn();
  const request = decodeAnalysisRequest('topic-modeling', {
    inputs: ['one', 'two'].map((name) => ({ source: { schema: 'data', name }, column: 'text' })),
  }).request;
  render(
    <TopicSamplingDialog
      base="sample-test"
      tab="one"
      request={request}
      knownCounts={new Map()}
      onClose={close}
      onConfirm={confirm}
    />,
  );
  const first = screen.getByRole('spinbutton', { name: 'one sample size' }),
    second = screen.getByRole('spinbutton', { name: 'two sample size' });
  await user.clear(first);
  await user.type(first, '60');
  await user.clear(second);
  await user.type(second, '40');
  await user.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  expect(confirm).toHaveBeenCalledWith(request, [
    { mode: 'count', count: 60 },
    { mode: 'count', count: 40 },
  ]);
  expect(close).toHaveBeenCalledOnce();
  expect(request).not.toHaveProperty('sampling');
});
it('blocks invalid sizes and Cancel does not calculate', async () => {
  const user = userEvent.setup();
  const confirm = vi.fn(),
    close = vi.fn();
  const request = decodeAnalysisRequest('topic-modeling', {
    inputs: [{ source: { schema: 'data', name: 'one' }, column: 'text' }],
  }).request;
  render(
    <TopicSamplingDialog
      base="invalid-test"
      tab="one"
      request={request}
      knownCounts={new Map()}
      onClose={close}
      onConfirm={confirm}
    />,
  );
  await user.clear(screen.getByRole('spinbutton', { name: 'one sample size' }));
  expect(screen.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
