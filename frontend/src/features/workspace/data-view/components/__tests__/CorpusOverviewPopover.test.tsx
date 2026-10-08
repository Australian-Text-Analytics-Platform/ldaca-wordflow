import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCorpusOverview, type CorpusOverviewResource } from '@/api';
import { CorpusOverviewPopover } from '../CorpusOverviewPopover';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getCorpusOverview: vi.fn(),
}));

const overview = (overrides: Partial<CorpusOverviewResource> = {}): CorpusOverviewResource => ({
  column: 'body',
  documents: 26163,
  empty_documents: 12,
  duplicate_documents: 40,
  unit: 'words',
  total: 9876543,
  minimum: 3,
  median: 310,
  mean: 377.46,
  maximum: 9001,
  ...overrides,
});

const show = (textColumns = ['title', 'body'], documentColumn: string | null = 'body') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CorpusOverviewPopover
        workspaceId="w"
        nodeId="n"
        shape={[26163, 7]}
        textColumns={textColumns}
        documentColumn={documentColumn}
        buttonClassName=""
      />
    </QueryClientProvider>,
  );

describe('CorpusOverviewPopover (issue 327)', () => {
  beforeEach(() => {
    vi.mocked(getCorpusOverview).mockReset();
  });

  it('reads nothing until opened, then shows the document column overview', async () => {
    vi.mocked(getCorpusOverview).mockResolvedValue({ data: overview() } as never);
    show();
    expect(getCorpusOverview).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Overview' }));

    const list = await screen.findByLabelText('Corpus overview');
    // Each term is followed by its value.
    expect(list).toHaveTextContent(`Documents${(26163).toLocaleString()}`);
    expect(list).toHaveTextContent(`Words${(9876543).toLocaleString()}`);
    expect(screen.getByText(`${(26163).toLocaleString()} rows × 7 columns`)).toBeInTheDocument();
    expect(vi.mocked(getCorpusOverview).mock.calls[0]?.[0]).toMatchObject({
      query: { column: 'body' },
    });
  });

  it('names characters for text with few spaces', async () => {
    vi.mocked(getCorpusOverview).mockResolvedValue({
      data: overview({ unit: 'characters' }),
    } as never);
    show(['text'], null);

    await userEvent.click(screen.getByRole('button', { name: 'Overview' }));

    expect(await screen.findByText('Characters')).toBeInTheDocument();
    expect(screen.getByText(/measured in characters/)).toBeInTheDocument();
  });

  it('says so when the Data Block has no text column', async () => {
    show([], null);

    await userEvent.click(screen.getByRole('button', { name: 'Overview' }));

    expect(screen.getByText('This Data Block has no text column to describe.')).toBeInTheDocument();
    expect(getCorpusOverview).not.toHaveBeenCalled();
  });
});
