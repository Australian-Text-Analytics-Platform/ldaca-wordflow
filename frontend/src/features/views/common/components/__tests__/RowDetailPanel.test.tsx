import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RowDetailPanel, type RowDetailNavigation } from '../RowDetailPanel';

const navigation = (overrides: Partial<RowDetailNavigation> = {}): RowDetailNavigation => ({
  canPrevious: true,
  canNext: true,
  pendingDirection: null,
  error: null,
  onPrevious: vi.fn(),
  onNext: vi.fn(),
  ...overrides,
});

describe('RowDetailPanel', () => {
  it('shows nested big integers and leaves missing values empty (issues 176 and 177)', () => {
    render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { offsets: [11n, 16n], missing: null } }}
        navigation={navigation()}
      />,
    );

    expect(screen.getByText(/"11"/)).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('renders persistent accessible row navigation outside the scroll body', async () => {
    const user = userEvent.setup();
    const controls = navigation();
    render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'First row' } }}
        navigation={controls}
      />,
    );

    const previous = screen.getByRole('button', { name: 'Previous row' });
    const next = screen.getByRole('button', { name: 'Next row' });
    expect(screen.getByTestId('row-detail-scroll')).not.toContainElement(
      screen.getByTestId('row-detail-navigation'),
    );
    await user.click(previous);
    await user.click(next);
    expect(controls.onPrevious).toHaveBeenCalledOnce();
    expect(controls.onNext).toHaveBeenCalledOnce();
  });

  it('shows pending and error states and resets scroll for a new payload', async () => {
    const { rerender } = render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'First row' } }}
        navigation={navigation({ pendingDirection: 'next' })}
      />,
    );
    const scrollBody = screen.getByTestId('row-detail-scroll');
    scrollBody.scrollTop = 120;
    expect(screen.getByRole('status')).toHaveTextContent('Loading next row');
    expect(screen.getByRole('button', { name: 'Previous row' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next row' })).toBeDisabled();

    rerender(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'Second row' } }}
        navigation={navigation({ error: 'Could not load the next row.' })}
      />,
    );
    await waitFor(() => {
      expect(scrollBody.scrollTop).toBe(0);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the next row.');
  });

  it('scrolls the document box to the renderer anchor on open', () => {
    const rectTop = (top: number) => ({ top }) as DOMRect;
    const renderDocumentText = () => (
      <span>
        Opening paragraph.{' '}
        <span data-testid="anchor" data-row-detail-anchor="">
          The extracted quote.
        </span>
      </span>
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.testid === 'anchor') return rectTop(500);
      if (this.dataset.testid === 'row-detail-document') return rectTop(100);
      return rectTop(0);
    });

    render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { text: 'unused' }, textColumn: 'text' }}
        customization={{ renderDocumentText }}
        navigation={navigation()}
      />,
    );

    // 400px below the box top, minus the 48px context margin.
    expect(screen.getByTestId('row-detail-document').scrollTop).toBe(352);
    expect(screen.getByTestId('row-detail-scroll').scrollTop).toBe(0);
    vi.restoreAllMocks();
  });

  it('steps with the left and right arrow keys, like the buttons', async () => {
    const user = userEvent.setup();
    const controls = navigation({ previousLabel: 'Previous passage', nextLabel: 'Next passage' });
    render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'First row', note: 'kept' } }}
        customization={{
          summaryFields: [{ label: 'Code', value: <input aria-label="Code" /> }],
        }}
        navigation={controls}
      />,
    );

    expect(screen.getByRole('button', { name: 'Next passage' })).toHaveAttribute(
      'aria-keyshortcuts',
      'ArrowRight',
    );
    // The window opens with focus in its first field; move it to a button.
    screen.getByRole('button', { name: 'Previous passage' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}');
    expect(controls.onNext).toHaveBeenCalledTimes(2);
    expect(controls.onPrevious).toHaveBeenCalledOnce();

    // A modifier, or a field that uses the arrow keys, keeps them.
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await user.click(screen.getByRole('textbox', { name: 'Code' }));
    await user.keyboard('{ArrowRight}');
    expect(controls.onNext).toHaveBeenCalledTimes(2);
  });

  it('ignores an arrow key with nowhere to go or while a step is loading', async () => {
    const user = userEvent.setup();
    const atEnd = navigation({ canNext: false });
    const { rerender } = render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'Last row' } }}
        navigation={atEnd}
      />,
    );
    await user.keyboard('{ArrowRight}');
    expect(atEnd.onNext).not.toHaveBeenCalled();

    const loading = navigation({ pendingDirection: 'next' });
    rerender(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'Last row' } }}
        navigation={loading}
      />,
    );
    await user.keyboard('{ArrowLeft}');
    expect(loading.onPrevious).not.toHaveBeenCalled();
  });

  it('still steps after focus falls out to the page', () => {
    const controls = navigation();
    render(
      <RowDetailPanel
        open
        onOpenChange={vi.fn()}
        payload={{ record: { label: 'Row' } }}
        navigation={controls}
      />,
    );
    // As when Next becomes disabled under focus at the last row. Whatever holds
    // focus has no role to query by, so it is read from the document.
    // eslint-disable-next-line testing-library/no-node-access
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(controls.onPrevious).toHaveBeenCalledOnce();
  });
});
