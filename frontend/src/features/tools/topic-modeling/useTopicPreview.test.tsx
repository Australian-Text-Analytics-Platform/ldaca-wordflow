import { reportProjectError } from '@/features/project/projectErrors';
import * as topicApi from '@/features/tools/topic-modeling/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { decodeAnalysisRequest } from '../common/analysisRequest';
import { useTopicPreview } from './useTopicPreview';

vi.mock('@/features/tools/topic-modeling/api', async (original) => ({
  ...(await original<object>()),
  streamTopicPreview: vi.fn(),
  deleteTopicPreview: vi.fn(),
}));
vi.mock('@/features/project/projectErrors', () => ({ reportProjectError: vi.fn() }));

const request = decodeAnalysisRequest('topic-modeling', {
  inputs: [{ source: { schema: 'data', name: 'source' }, column: 'text' }],
}).request;
const sampling: topicApi.TopicSampling[] = [{ mode: 'count', count: 60 }];
const update = (id: string): topicApi.TopicPreviewUpdate => ({
  state: 'preparing',
  preview_id: id,
  stage: 'Embedding documents',
  fraction: 0.5,
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(({ active }) => useTopicPreview('base', 'tab', active), {
      wrapper,
      initialProps: { active: true },
    }),
  };
}
describe('Topic Preview connection ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(topicApi.streamTopicPreview).mockImplementation(
      () =>
        new Promise(() => {
          // A completed Preview keeps its streaming connection open until its owner leaves.
        }),
    );
  });
  it('captures requests and ignores a superseded stream and cleared pages', () => {
    const { result, client, unmount } = setup();
    const draft = structuredClone(request);
    act(() => result.current.submit(draft, sampling));
    const first = vi.mocked(topicApi.streamTopicPreview).mock.calls[0]!;
    draft.seed = 10;
    expect(first[2].request.seed).toBe(0);
    act(() => result.current.submit(draft, sampling));
    expect(first[3].aborted).toBe(true);
    const second = vi.mocked(topicApi.streamTopicPreview).mock.calls[1]!;
    act(() => first[4](update('old')));
    expect(result.current.state?.update).toBeUndefined();
    act(() => second[4](update('new')));
    client.setQueryData(['native', 'base', 'analysis-preview', 'tab', 'map'], { topics: [] });
    act(() => result.current.clear());
    act(() => second[4](update('late')));
    expect(second[3].aborted).toBe(true);
    expect(result.current.state).toBeNull();
    expect(
      client.getQueryData(['native', 'base', 'analysis-preview', 'tab', 'map']),
    ).toBeUndefined();
    unmount();
  });
  it('discards Preview on navigation without recalculating on return', () => {
    const { result, rerender, unmount } = setup();
    act(() => result.current.submit(request, sampling));
    const stream = vi.mocked(topicApi.streamTopicPreview).mock.calls[0]!;
    act(() => stream[4](update('preview')));
    rerender({ active: false });
    expect(stream[3].aborted).toBe(true);
    expect(result.current.state).toBeNull();
    rerender({ active: true });
    act(() => stream[4](update('late')));
    expect(result.current.state).toBeNull();
    expect(topicApi.streamTopicPreview).toHaveBeenCalledTimes(1);
    unmount();
  });
  it('marks source invalidation outdated without fitting again', async () => {
    const { result, client, unmount } = setup();
    act(() => result.current.submit(request, sampling));
    await act(() => client.invalidateQueries({ queryKey: ['native', 'base', 'unrelated'] }));
    expect(result.current.state?.outdated).toBeUndefined();
    await act(() =>
      client.invalidateQueries({
        queryKey: ['native', 'base', 'analysis-preview', 'tab', 'source-watch'],
      }),
    );
    expect(result.current.state?.outdated).toBe(true);
    expect(topicApi.streamTopicPreview).toHaveBeenCalledTimes(1);
    unmount();
  });
  it('shows cancellation until native cleanup completes and rejects late updates', async () => {
    let finish!: () => void;
    vi.mocked(topicApi.deleteTopicPreview).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = setup();
    act(() => result.current.submit(request, sampling));
    const stream = vi.mocked(topicApi.streamTopicPreview).mock.calls[0]!;
    act(() => stream[4](update('preview')));
    let cancelling!: Promise<void>;
    act(() => {
      cancelling = result.current.cancel();
    });
    expect(result.current.state?.cancelling).toBe(true);
    expect(stream[3].aborted).toBe(false);
    act(() => stream[4](update('late')));
    expect(result.current.state?.update?.preview_id).toBe('preview');
    await act(async () => {
      finish();
      await cancelling;
    });
    expect(stream[3].aborted).toBe(true);
    expect(result.current.state).toBeNull();
    expect(reportProjectError).not.toHaveBeenCalled();
    unmount();
  });
});

it('retains original Preview and cancellation diagnostics in the existing owner without a toast', async () => {
  const failure = Object.assign(new Error('Original provider detail'), {
    details: 'HTTP 502 from the provider',
  });
  vi.mocked(topicApi.streamTopicPreview).mockRejectedValueOnce(failure);
  const { result, unmount } = setup();
  await act(async () => result.current.submit(request, sampling));
  expect(result.current.state?.diagnostic).toBe(failure);
  expect(reportProjectError).not.toHaveBeenCalled();
  vi.mocked(topicApi.streamTopicPreview).mockImplementation(() => new Promise(() => {}));
  act(() => result.current.submit(request, sampling));
  const stream = vi.mocked(topicApi.streamTopicPreview).mock.calls.at(-1)!;
  act(() => stream[4](update('preview')));
  vi.mocked(topicApi.deleteTopicPreview).mockRejectedValueOnce(failure);
  await act(async () => result.current.cancel());
  expect(result.current.state?.diagnostic).toBe(failure);
  expect(result.current.state?.cancelling).toBe(false);
  expect(stream[3].aborted).toBe(false);
  vi.mocked(topicApi.deleteTopicPreview).mockResolvedValueOnce(undefined);
  await act(async () => result.current.cancel());
  expect(result.current.state).toBeNull();
  expect(stream[3].aborted).toBe(true);
  unmount();
});
