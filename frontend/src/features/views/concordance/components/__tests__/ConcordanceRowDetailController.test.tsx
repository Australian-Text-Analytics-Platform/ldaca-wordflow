/* eslint-disable testing-library/no-node-access -- the highlighted parts are marks inside the document box. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CONCORDANCE_COLUMN_KEYS as K } from '../../../common/generatedColumns';
import type { ConcordanceRowDetailItem } from '../../concordanceRowDetail';
import { ConcordanceRowDetailController } from '../ConcordanceRowDetailController';

/** A hit in `text` at code-point offsets, with one word of context each side. */
const hit = (text: string, start: number, end: number, left: string, right: string) => ({
  text,
  [K.matchedText]: text.slice(start, end),
  [K.leftContext]: left,
  [K.rightContext]: right,
  [K.startIdx]: start,
  [K.endIdx]: end,
  [K.leftToken]: left.trim(),
  [K.rightToken]: right.trim(),
  [K.leftTokenFreq]: 1,
  [K.rightTokenFreq]: 2,
});

const first = 'I know What you did. What is it?';
const second = 'So what now, What then';
const dispersionItems: ConcordanceRowDetailItem[] = [
  {
    row: hit(first, 21, 25, '', ' is'),
    nodeId: 'node-1',
    column: 'text',
    // Out of document order on purpose: Previous/Next follow positions.
    groupedHits: [hit(first, 21, 25, 'did. ', ' is'), hit(first, 7, 11, 'know ', ' you')],
  },
  {
    row: hit(second, 3, 7, 'So ', ' now'),
    nodeId: 'node-1',
    column: 'text',
    groupedHits: [hit(second, 3, 7, 'So ', ' now'), hit(second, 13, 17, 'now, ', ' then')],
  },
];

const renderController = (
  items: ConcordanceRowDetailItem[],
  view: Parameters<typeof ConcordanceRowDetailController>[0]['view'],
) =>
  render(
    <ConcordanceRowDetailController
      sequenceKey="test"
      items={items}
      page={1}
      hasPreviousPage={false}
      hasNextPage={false}
      loading={false}
      onPageChange={vi.fn()}
      searchWord="what"
      view={view}
    >
      {(openDetailAt) => (
        <button
          type="button"
          onClick={() => {
            openDetailAt(0);
          }}
        >
          open
        </button>
      )}
    </ConcordanceRowDetailController>,
  );

/** A summary field's text, e.g. "L1 Word: know". */
const field = (dialog: HTMLElement, label: string) =>
  within(dialog).getByText(`${label}:`).parentElement?.textContent;

const currentMatch = (dialog: HTMLElement) =>
  within(dialog)
    .getByTestId('row-detail-document')
    .querySelector('[data-concordance-part="match"]');

describe('ConcordanceRowDetailController (issue 429)', () => {
  it('highlights the table row’s match and contexts, and steps through rows', async () => {
    const user = userEvent.setup();
    renderController(
      [
        { row: hit(first, 7, 11, 'know ', ' you'), nodeId: 'node-1', column: 'text' },
        { row: hit(first, 21, 25, 'did. ', ' is'), nodeId: 'node-1', column: 'text' },
      ],
      { kind: 'table' },
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Row Details (Concordance)')).toBeInTheDocument();
    const document = within(dialog).getByTestId('row-detail-document');
    expect(document).toHaveTextContent(first);
    expect(currentMatch(dialog)).toHaveTextContent('What');
    expect(currentMatch(dialog)).toHaveAttribute('data-row-detail-anchor');
    const contexts = Array.from(document.querySelectorAll('[data-concordance-part="context"]'));
    expect(contexts.map((part) => part.textContent)).toEqual(['know ', ' you']);
    // Other matches in the same document stay plain in the table view.
    expect(document.querySelector('[data-concordance-part="other-match"]')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Next row' }));
    expect(within(dialog).getByTestId('row-detail-document').textContent).toBe(first);
    expect(
      Array.from(
        within(dialog)
          .getByTestId('row-detail-document')
          .querySelectorAll('[data-concordance-part="context"]'),
      ).map((part) => part.textContent),
    ).toEqual(['did. ', ' is']);
  });

  it('steps through Dispersion matches in order and on into the next document', async () => {
    const user = userEvent.setup();
    renderController(dispersionItems, {
      kind: 'dispersion',
      termColors: { What: '#dc2626', what: '#2563eb' },
    });
    await user.click(screen.getByRole('button', { name: 'open' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Match Details (Dispersion)')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 of 2/)).toBeInTheDocument();
    expect(field(dialog, 'L1 Word')).toBe('L1 Word:know');
    expect(currentMatch(dialog)?.getAttribute('style')).toContain('rgb(220, 38, 38)');
    expect(
      within(dialog)
        .getByTestId('row-detail-document')
        .querySelectorAll('[data-concordance-part="other-match"]'),
    ).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'Previous match' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Next match' }));
    expect(within(dialog).getByText(/2 of 2/)).toBeInTheDocument();
    expect(field(dialog, 'L1 Word')).toBe('L1 Word:did.');

    await user.click(within(dialog).getByRole('button', { name: 'Next match' }));
    expect(within(dialog).getByTestId('row-detail-document')).toHaveTextContent(second);
    expect(within(dialog).getByText(/1 of 2/)).toBeInTheDocument();
    expect(currentMatch(dialog)).toHaveTextContent('what');
    expect(currentMatch(dialog)?.getAttribute('style')).toContain('rgb(37, 99, 235)');

    await user.click(within(dialog).getByRole('button', { name: 'Previous match' }));
    expect(within(dialog).getByTestId('row-detail-document')).toHaveTextContent(first);
    expect(within(dialog).getByText(/2 of 2/)).toBeInTheDocument();
  });
});
