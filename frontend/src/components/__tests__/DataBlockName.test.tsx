import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataBlockName } from '@/components/DataBlockName';

describe('DataBlockName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches clipping direction when a renamed single-line label stops overflowing', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);

    const { rerender } = render(
      <DataBlockName
        name="sample_data/ADO/qldelection2020_candidate_tweets"
        backgroundColor="#2563eb"
        maxLines={1}
        fadeEdge="head"
      />,
    );

    const viewport = screen.getByTestId('data-block-name');
    await waitFor(() => expect(viewport).toHaveAttribute('dir', 'rtl'));
    expect(screen.getByText(/qldelection2020_candidate_tweets/)).toHaveAttribute('dir', 'ltr');
    width.mockReturnValue(60);
    rerender(<DataBlockName name="Short" backgroundColor="#2563eb" maxLines={1} fadeEdge="head" />);
    await waitFor(() => expect(viewport).toHaveAttribute('dir', 'ltr'));
    expect(screen.getByText('Short')).toBeInTheDocument();
  });

  it('detects vertical overflow for wrapped names', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(96);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(48);

    render(
      <DataBlockName
        name="sample_data/ADO/qldelection2020_candidate_tweets"
        backgroundColor="#2563eb"
        maxLines={3}
        fadeEdge="head"
      />,
    );

    const viewport = screen.getByTestId('data-block-name');
    expect(viewport).toHaveAttribute('dir', 'ltr');
    await waitFor(() =>
      expect(screen.getByTestId('data-block-name-head-fade')).toHaveClass('opacity-100'),
    );
  });
});
