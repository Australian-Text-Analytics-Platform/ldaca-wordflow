import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Field, Int64 } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';

import { FilterConditionValueInput } from '../FilterConditionValueInput';

describe('FilterConditionValueInput numeric between (issue 277)', () => {
  it('shows From and To boxes and updates one end at a time', () => {
    const onConditionChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FilterConditionValueInput
          condition={{
            id: 'c1',
            column: 'resp_age',
            operator: 'between',
            value: { start: '26', end: null },
            field: new Field('resp_age', new Int64()),
          }}
          disabled={false}
          hasSelection
          workspaceId={null}
          nodeId={null}
          optionSearchQueries={{}}
          onOptionSearchQueryChange={vi.fn()}
          onConditionChange={onConditionChange}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('From (included)')).toHaveValue(26);
    fireEvent.change(screen.getByLabelText('To (included)'), { target: { value: '30' } });
    expect(onConditionChange).toHaveBeenCalledWith('c1', 'value', { start: '26', end: '30' });
  });
});
