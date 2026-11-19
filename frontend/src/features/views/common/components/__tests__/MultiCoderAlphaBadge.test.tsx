import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MultiCoderAlphaBadge } from '../MultiCoderAlphaBadge';

const combinations = [
  { values: ['job', 'job', 'job'], count: 5 },
  { values: ['covid', 'covid', null], count: 4 },
  { values: ['job', 'covid', 'job'], count: 1 },
  { values: ['covid', null, null], count: 2 },
];

describe('MultiCoderAlphaBadge', () => {
  it('shows Alpha across every coder, the coders, and the coincidence matrix', async () => {
    const user = userEvent.setup();
    render(
      <MultiCoderAlphaBadge
        columns={['annotation', 'reviewer', 'model']}
        combinations={combinations}
        scale={null}
        isLoading={false}
        isError={false}
      />,
    );

    const badge = screen.getByTestId('multi-coder-alpha');
    expect(badge).toHaveTextContent(/^α \d\.\d{3}· 3 coders$/);
    expect(badge).toHaveAccessibleName(/^Krippendorff’s Alpha across 3 coders \d\.\d{3}$/);
    await user.hover(badge);

    const [method] = await screen.findAllByTestId('multi-coder-method');
    expect(method).toHaveTextContent(
      'Krippendorff’s Alpha across 3 coders: annotation, reviewer, model. Only exact matches agree. A text counts when at least two of them coded it (10 texts).',
    );
    expect(
      screen.getAllByRole('table', { name: 'coincidence matrix of 3 coders' })[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText('Green: two coders gave the same code.')[0]).toBeInTheDocument();
  });

  it('is ordinal on a scale and says Preview counts the page', async () => {
    const user = userEvent.setup();
    render(
      <MultiCoderAlphaBadge
        columns={['annotation (preview)', 'reviewer', 'model']}
        combinations={[
          { values: ['Low', 'Low', 'High'], count: 2 },
          { values: ['High', 'High', 'High'], count: 3 },
        ]}
        scale={{ levels: ['Low', 'High'], outside: [] }}
        isLoading={false}
        isError={false}
        pageOnly
      />,
    );
    const badge = screen.getByTestId('multi-coder-alpha');
    expect(badge).toHaveTextContent(/^αo /);
    await user.hover(badge);
    const [method] = await screen.findAllByTestId('multi-coder-method');
    expect(method).toHaveTextContent('Ordinal Krippendorff’s Alpha across 3 coders');
    expect(method).toHaveTextContent('(5 texts on this page)');
  });
});
