import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ChartExport from '@/lib/chartExport';

const downloads = vi.hoisted(
  () => [] as { svg: SVGSVGElement; options: { nodeName?: string; toolSuffix?: string } }[],
);
vi.mock('@/lib/chartExport', async (importOriginal) => {
  const actual = await importOriginal<typeof ChartExport>();
  return {
    ...actual,
    downloadChartAs: (svg: SVGSVGElement, options: { nodeName?: string; toolSuffix?: string }) => {
      downloads.push({ svg, options });
      return Promise.resolve();
    },
  };
});

import { ColumnComparisonHeader } from '../ColumnComparison';
import { MultiCoderAlphaBadge } from '../MultiCoderAlphaBadge';

/** The lines of text the image draws, read from its markup. */
const drawnText = (svg: SVGSVGElement) =>
  Array.from(
    new XMLSerializer().serializeToString(svg).matchAll(/<text[^>]*>([^<]*)<\/text>/g),
    ([, text]) => text,
  );

/** Opens the popup, chooses its Download, then the format dialog's Download. */
const downloadFromPopup = async (badge: HTMLElement, buttonName: string) => {
  const user = userEvent.setup();
  await user.hover(badge);
  const [button] = await screen.findAllByRole('button', { name: buttonName });
  if (!button) throw new Error(`No ${buttonName} button`);
  await user.click(button);
  const dialog = await screen.findByRole('alertdialog', { name: buttonName });
  expect(dialog).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Download' }));
};

describe('reliability popup Download', () => {
  beforeEach(() => {
    downloads.length = 0;
  });

  it('saves the pairwise score, its description and the confusion matrix as an image', async () => {
    render(
      <ColumnComparisonHeader
        metric="cohens_kappa"
        referenceColumn="annotation"
        comparisonColumn="model"
        rows={[
          { reference: 'covid', comparison: 'covid', count: 3 },
          { reference: 'covid', comparison: 'job', count: 1 },
          { reference: 'job', comparison: 'covid', count: 1 },
          { reference: 'job', comparison: 'job', count: 3 },
        ]}
        isLoading={false}
        isError={false}
        revealed={false}
        onRevealedChange={vi.fn()}
        nodeName="ACE-Text"
      />,
    );

    await downloadFromPopup(
      screen.getByRole('button', { name: /^Cohen’s Kappa 0\.500 for annotation versus model$/ }),
      'Download confusion matrix',
    );

    await vi.waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    const [download] = downloads;
    expect(download?.options).toMatchObject({
      nodeName: 'ACE-Text annotation vs model',
      toolSuffix: 'confusion_matrix',
    });
    expect(drawnText(download!.svg)).toEqual(
      expect.arrayContaining([
        'Cohen’s Kappa, annotation versus model: κ 0.500',
        'Data Block: ACE-Text',
        'Cohen’s Kappa on categories: only exact matches agree.',
        'Green: both columns agree.',
      ]),
    );
  });

  it('marks a Preview coincidence matrix in its title and file name', async () => {
    render(
      <MultiCoderAlphaBadge
        columns={['annotation', 'reviewer', 'model']}
        combinations={[
          { values: ['job', 'job', 'job'], count: 5 },
          { values: ['covid', 'covid', null], count: 4 },
          { values: ['job', 'covid', 'job'], count: 1 },
        ]}
        scale={null}
        isLoading={false}
        isError={false}
        pageOnly
      />,
    );

    await downloadFromPopup(screen.getByTestId('multi-coder-alpha'), 'Download coincidence matrix');

    await vi.waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    const [download] = downloads;
    expect(download?.options).toMatchObject({
      nodeName: 'annotation',
      toolSuffix: 'coincidence_matrix_preview',
    });
    const drawn = drawnText(download!.svg);
    expect(drawn.join(' ')).toMatch(
      /^Krippendorff’s Alpha across 3 coders: α \d\.\d{3} \(Preview\) /,
    );
    expect(drawn.join(' ')).toContain('A text counts when at least two of them coded it');
    expect(drawn.join(' ')).toContain('Coincidence matrix: each cell counts the pairs');
  });

  it('offers no Download while the score is loading', async () => {
    const user = userEvent.setup();
    render(
      <MultiCoderAlphaBadge
        columns={['annotation', 'reviewer']}
        combinations={undefined}
        scale={null}
        isLoading
        isError={false}
      />,
    );
    await user.hover(screen.getByTestId('multi-coder-alpha'));
    await screen.findAllByText('Loading agreement…');
    expect(screen.queryByRole('button', { name: 'Download coincidence matrix' })).toBeNull();
  });
});
