import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vite-plus/test';
import { ResultColumnOrder } from './ResultColumnOrder';
import { resultColumnKey } from '../resultColumns';

it('offers searchable columns and keyboard ordering without changing sort', async () => {
  const user = userEvent.setup();
  const columns = [
    { column: 'Document', metadata: true },
    { column: 'quote', metadata: false },
  ];
  const change = vi.fn();
  render(<ResultColumnOrder columns={columns} onChange={change} />);
  await user.click(screen.getByRole('button', { name: 'Column order' }));
  await user.click(screen.getByRole('button', { name: 'Move quote up' }));
  expect(change).toHaveBeenLastCalledWith([
    resultColumnKey(columns[1]!),
    resultColumnKey(columns[0]!),
  ]);
  await user.type(screen.getByRole('textbox', { name: 'Find result column' }), 'quote');
  expect(screen.queryByRole('button', { name: 'Move Document down' })).not.toBeInTheDocument();
  screen.getByLabelText('Order quote').focus();
  await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
  expect(change).toHaveBeenCalledTimes(2);
});
