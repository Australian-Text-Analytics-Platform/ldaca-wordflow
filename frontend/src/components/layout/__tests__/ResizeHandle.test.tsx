import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResizeHandle } from '../ResizeHandle';

describe('ResizeHandle', () => {
  it.each(['vertical', 'horizontal'] as const)(
    'preserves %s separator interaction props',
    (orientation) => {
      const onPointerDown = vi.fn();
      render(
        <ResizeHandle
          orientation={orientation}
          aria-label="Resize sidebar"
          tabIndex={0}
          onPointerDown={onPointerDown}
        />,
      );

      const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
      expect(handle).toHaveAttribute('aria-orientation', orientation);
      expect(handle).toHaveAttribute('tabindex', '0');

      fireEvent.pointerDown(handle, { pointerId: 1, button: 0 });
      expect(onPointerDown).toHaveBeenCalledOnce();
    },
  );

  it('removes a disabled separator from keyboard navigation', () => {
    render(
      <ResizeHandle orientation="horizontal" disabled tabIndex={0} aria-label="Resize cards" />,
    );

    const handle = screen.getByRole('separator', { name: 'Resize cards' });
    expect(handle).toHaveAttribute('aria-disabled', 'true');
    expect(handle).toHaveAttribute('tabindex', '-1');
  });
});
