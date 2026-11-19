import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotationCorrectionColumnControl } from '../AnnotationCorrectionColumnControl';

describe('AnnotationCorrectionColumnControl', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('selects None, existing columns, and the create action from one dropdown', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onCreate = vi.fn();

    render(
      <AnnotationCorrectionColumnControl
        value="review"
        availableColumns={['review', 'adjudication']}
        onValueChange={onValueChange}
        onCreate={onCreate}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Correction column' });
    expect(trigger).toHaveTextContent('review');

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'None' }));
    expect(onValueChange).toHaveBeenCalledWith(null);

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'adjudication' }));
    expect(onValueChange).toHaveBeenCalledWith('adjudication');

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Create new…' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('shows the example shortcut only when supplied and enables it for a selection', async () => {
    const user = userEvent.setup();
    const onUseAsExample = vi.fn();
    const { rerender } = render(
      <AnnotationCorrectionColumnControl
        value={null}
        availableColumns={['review']}
        onValueChange={vi.fn()}
        onCreate={vi.fn()}
        onUseAsExample={onUseAsExample}
      />,
    );

    expect(screen.getByRole('button', { name: 'Use as example' })).toBeDisabled();

    rerender(
      <AnnotationCorrectionColumnControl
        value="review"
        availableColumns={['review']}
        onValueChange={vi.fn()}
        onCreate={vi.fn()}
        onUseAsExample={onUseAsExample}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Use as example' }));
    expect(onUseAsExample).toHaveBeenCalledTimes(1);
  });

  it('clears a stored selection that is absent from the loaded schema', async () => {
    const onValueChange = vi.fn();

    const { rerender } = render(
      <AnnotationCorrectionColumnControl
        value="deleted_column"
        availableColumns={['review']}
        onValueChange={onValueChange}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Correction column' })).toHaveTextContent('None');
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(null));

    rerender(
      <AnnotationCorrectionColumnControl
        value={null}
        availableColumns={['review']}
        onValueChange={onValueChange}
        onCreate={vi.fn()}
      />,
    );
    rerender(
      <AnnotationCorrectionColumnControl
        value="deleted_column"
        availableColumns={['review']}
        onValueChange={onValueChange}
        onCreate={vi.fn()}
      />,
    );
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('explains each control on hover, and why Use as example waits', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AnnotationCorrectionColumnControl
        value={null}
        availableColumns={['review']}
        onValueChange={vi.fn()}
        onCreate={vi.fn()}
        onUseAsExample={vi.fn()}
      />,
    );

    // The disabled button's wrapper takes focus and shows why it waits.
    await user.tab();
    await user.tab();
    expect(
      (await screen.findAllByText('Choose a correction column first.'))[0],
    ).toBeInTheDocument();

    rerender(
      <AnnotationCorrectionColumnControl
        value="review"
        availableColumns={['review']}
        onValueChange={vi.fn()}
        onCreate={vi.fn()}
        onUseAsExample={vi.fn()}
      />,
    );
    await user.hover(screen.getByRole('button', { name: 'Use as example' }));
    expect(
      (await screen.findAllByText(/Use the corrected rows as examples for AI annotation/))[0],
    ).toBeInTheDocument();

    await user.hover(screen.getByRole('combobox', { name: 'Correction column' }));
    expect(
      (await screen.findAllByText(/A column for your corrections, kept apart/))[0],
    ).toBeInTheDocument();
  });
});
