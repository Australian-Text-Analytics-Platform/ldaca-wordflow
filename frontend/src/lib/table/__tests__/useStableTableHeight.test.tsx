import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStableTableHeight } from '../useStableTableHeight';

function Wrapped({ rows }: { rows: number }) {
  const ref = useStableTableHeight<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="wrapper">
      <table data-rows={rows}>
        <tbody>
          {Array.from({ length: rows }, (_, index) => (
            <tr key={index}>
              <td>{index}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

describe('useStableTableHeight', () => {
  it("holds the wrapper at the table's height after each render (issue 209)", () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const rows = Number(this.getAttribute('data-rows') ?? 0);
        return { height: rows * 28 } as DOMRect;
      });

    const { rerender } = render(<Wrapped rows={10} />);
    expect(screen.getByTestId('wrapper').style.minHeight).toBe('280px');

    // A real change in height applies once the update is done.
    rerender(<Wrapped rows={4} />);
    expect(screen.getByTestId('wrapper').style.minHeight).toBe('112px');
    rect.mockRestore();
  });
});
