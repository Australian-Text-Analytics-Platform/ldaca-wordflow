import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import * as api from './api';
import { TopicAdjustments } from './TopicAdjustments';
import { decodeAnalysisRequest } from '../common/analysisRequest';
vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  adjustTopicModel: vi.fn(),
}));
vi.mock('../token-frequency/api', async (original) => ({
  ...(await original<object>()),
  getTokenizers: vi.fn().mockResolvedValue([]),
}));
afterEach(() => vi.useRealTimers());

it('debounces adjustments, ignores superseded replies and keeps failed editable settings for Retry', async () => {
  vi.useFakeTimers();
  const request = decodeAnalysisRequest('topic-modeling', undefined).request;
  const summary: api.TopicSummary = {
    sources: [],
    natural_topic_count: 2,
    segment_count: 50,
    resolved_model: 'fixture',
    natural_projection: 'old',
    parameters: { minimum_topic_size: 10, maximum_topic_size: null, tokenizer: request.tokenizer },
  };
  let finish: (value: { summary: api.TopicSummary }) => void = () => undefined;
  vi.mocked(api.adjustTopicModel)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('Original engine diagnostic'))
    .mockResolvedValueOnce({ summary: { ...summary, natural_projection: 'new' } });
  const receive = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TopicAdjustments
        base="base"
        owner={{ analysis: 'analysis' }}
        summary={summary}
        request={request}
        disabled={false}
        onAdjusted={receive}
      />
    </QueryClientProvider>,
  );
  await act(async () => {});
  expect(
    screen.queryByRole('spinbutton', { name: 'Adjusted minimum topic size' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Limit maximum topic size' }));
  const input = screen.getByRole('spinbutton', { name: 'Maximum topic size' });
  fireEvent.change(input, { target: { value: '25' } });
  fireEvent.blur(input);
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(api.adjustTopicModel).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  const first = vi.mocked(api.adjustTopicModel).mock.calls[0]!;
  fireEvent.change(input, { target: { value: '30' } });
  fireEvent.blur(input);
  expect(first[3].aborted).toBe(true);
  await act(async () => {
    finish({ summary });
  });
  expect(receive).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(screen.getByRole('alert')).toHaveTextContent('Original engine diagnostic');
  expect(input).toHaveValue(30);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(receive).toHaveBeenCalledExactlyOnceWith({
    summary: expect.objectContaining({ natural_projection: 'new' }),
  });
  expect(vi.mocked(api.adjustTopicModel).mock.calls[2]?.[2]).toEqual({
    expected_projection: 'old',
    settings: { minimum_topic_size: 10, maximum_topic_size: 30, tokenizer: request.tokenizer },
  });
});
