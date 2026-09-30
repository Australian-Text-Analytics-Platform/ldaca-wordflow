import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { GraphControlButton } from '../GraphControlButton';
import { TooltipProvider } from '../ui/tooltip';

it('exposes the name on focus and preserves the icon action and pressed state', () => {
  const click = vi.fn();
  render(
    <TooltipProvider>
      <GraphControlButton accessibleLabel="Show overview" label="Overview" active onClick={click}>
        <svg />
      </GraphControlButton>
    </TooltipProvider>,
  );
  const button = screen.getByRole('button', { name: 'Show overview' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Overview');
  expect(button).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
});

it('allows a disabled action name to be inspected without enabling its action', () => {
  const click = vi.fn();
  render(
    <TooltipProvider>
      <GraphControlButton
        accessibleLabel="Clear filter"
        label="Clear filter"
        disabled
        onClick={click}
      >
        <svg />
      </GraphControlButton>
    </TooltipProvider>,
  );
  const button = screen.getByRole('button', { name: 'Clear filter' });
  expect(button).toBeDisabled();
  const wrapper = screen
    .getAllByLabelText('Clear filter')
    .find((element) => element.getAttribute('tabindex') === '0')!;
  expect(wrapper).toHaveAttribute('tabindex', '0');
  fireEvent.focus(wrapper);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Clear filter');
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});
