import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FrequencyComparison } from './FrequencyComparison';

const row = {
  token: 'language',
  freq_corpus_0: 18446744073709551615n,
  freq_corpus_1: '9007199254740993',
  percent_corpus_0: 2.5,
  percent_corpus_1: 2,
  percent_diff: 25,
  overuse: 'Reference',
  signed_ll: 15.15,
  relative_risk: 1.25,
  log_ratio: 0.321928,
  odds_ratio: 1.2,
  log_likelihood_llv: 15.15,
  bayes_factor_bic: 4.15,
  effect_size_ell: 0.01234,
  significance: '****',
};

describe('FrequencyComparison', () => {
  it('preserves exact counts and labels native Reference-to-Study statistics correctly', () => {
    render(
      <FrequencyComparison
        label="Reference and Study comparison"
        rows={[row]}
        sort="log_likelihood_llv"
        descending
        onSort={vi.fn()}
      />,
    );
    const table = screen.getByRole('table', { name: 'Reference and Study comparison' });
    expect(within(table).getByText('18446744073709551615')).toBeInTheDocument();
    expect(within(table).getByText('9007199254740993')).toBeInTheDocument();
    expect(within(table).getByText('25.00%')).toBeInTheDocument();
    expect(within(table).getByText('Reference')).toBeInTheDocument();
    expect(within(table).getByText('+15.15')).toBeInTheDocument();
    expect(within(table).getByText('2.50%')).toBeInTheDocument();
    expect(within(table).getByText('0.3219')).toBeInTheDocument();
    expect(within(table).getByText('0.0123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by LogRatio' })).toHaveAttribute(
      'title',
      expect.stringContaining('Base-2 logarithm'),
    );
    expect(screen.getByRole('columnheader', { name: 'LL', exact: true })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('delegates sort keys and preserves supplied row order', () => {
    const sort = vi.fn();
    const { rerender } = render(
      <FrequencyComparison
        label="Comparison"
        rows={[row, { ...row, token: 'another' }]}
        sort="log_likelihood_llv"
        descending
        onSort={sort}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Reference count' }));
    expect(sort).toHaveBeenCalledExactlyOnceWith('freq_corpus_0');
    expect(within(screen.getAllByRole('row')[1]).getByText('language')).toBeInTheDocument();
    rerender(
      <FrequencyComparison
        label="Comparison"
        rows={[row]}
        sort="freq_corpus_0"
        descending={false}
        onSort={sort}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Reference count' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('shows nonfinite statistics honestly and supports keyboard or pointer stopword actions', () => {
    const context = vi.fn();
    render(
      <FrequencyComparison
        label="Comparison"
        rows={[
          {
            ...row,
            relative_risk: Infinity,
            log_ratio: -Infinity,
            odds_ratio: NaN,
            effect_size_ell: null,
            significance: '',
          },
        ]}
        sort="token"
        descending={false}
        onSort={vi.fn()}
        onTokenContextMenu={context}
      />,
    );
    expect(screen.getByText('+∞')).toBeInTheDocument();
    expect(screen.getByText('−∞')).toBeInTheDocument();
    expect(screen.getByText('Undefined')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('n.s.')).toBeInTheDocument();
    const result = screen.getAllByRole('row')[1];
    fireEvent.contextMenu(result);
    fireEvent.keyDown(result, { key: 'F10', shiftKey: true });
    expect(context.mock.calls).toEqual([['language'], ['language']]);
  });

  it('makes extreme differences readable without rescaling the saved percentage', async () => {
    render(
      <FrequencyComparison
        label="Comparison"
        rows={[{ ...row, freq_corpus_1: 0n, percent_diff: 1.27409705295812096e18 }]}
        sort="percent_diff"
        descending
        onSort={vi.fn()}
      />,
    );
    const difference = screen.getByText('1.27e+18%');
    expect(difference).toHaveAttribute('tabindex', '0');
    fireEvent.focus(difference);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Study count is zero. The %DIFF method divides by 1e-18',
    );
  });

  it('keeps headers visible for an empty result', () => {
    render(
      <FrequencyComparison
        label="Comparison"
        rows={[]}
        sort="token"
        descending={false}
        onSort={vi.fn()}
      />,
    );
    expect(screen.getByText('No matching tokens.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Study count' })).toBeInTheDocument();
  });
});
