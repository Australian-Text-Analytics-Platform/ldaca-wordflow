import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MetadataColumnSelector } from '../MetadataColumnSelector';

const TestHarness = ({
  disabledReason,
  disabledColumns,
}: {
  disabledReason?: string;
  disabledColumns?: string[];
}) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  return (
    <MetadataColumnSelector
      availableColumns={['document', 'speaker']}
      selectedColumns={selectedColumns}
      onSelectedColumnsChange={setSelectedColumns}
      disabledReason={disabledReason}
      disabledColumns={disabledColumns}
    />
  );
};

describe('MetadataColumnSelector', () => {
  it('keeps the dropdown enabled by default and starts with no columns selected', () => {
    const { container } = render(<TestHarness />);
    const view = within(container);

    const trigger = view.getByRole('button', { name: /show metadata/i });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent(/show metadata \(0\)/i);
  });

  it('disables the dropdown when a disabledReason is supplied', () => {
    const { container } = render(<TestHarness disabledReason="No shared columns" />);
    const view = within(container);

    expect(view.getByRole('button', { name: /show metadata/i })).toBeDisabled();
  });

  it('lets users select all columns or individual metadata columns', () => {
    const { container } = render(<TestHarness />);
    const view = within(container);

    fireEvent.pointerDown(view.getByRole('button', { name: /show metadata/i }), { button: 0 });

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /select all/i }));

    expect(screen.getByRole('menuitemcheckbox', { name: /document/i })).toHaveAttribute(
      'data-state',
      'checked',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: /speaker/i })).toHaveAttribute(
      'data-state',
      'checked',
    );

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /speaker/i }));

    expect(screen.getByRole('menuitemcheckbox', { name: /document/i })).toHaveAttribute(
      'data-state',
      'checked',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: /speaker/i })).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  });

  it('disables opposite-role columns and skips them when selecting all', () => {
    const { container } = render(<TestHarness disabledColumns={['speaker']} />);
    const view = within(container);

    fireEvent.pointerDown(view.getByRole('button', { name: /show metadata/i }), { button: 0 });
    expect(screen.getByRole('menuitemcheckbox', { name: /speaker/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /select all/i }));
    expect(screen.getByRole('menuitemcheckbox', { name: /document/i })).toHaveAttribute(
      'data-state',
      'checked',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: /speaker/i })).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  });

  it('offers a name filter only for lists twice as long as the menu shows (issue 373)', async () => {
    const Many = ({ count }: { count: number }) => {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <MetadataColumnSelector
          availableColumns={Array.from({ length: count }, (_v, i) => `col_${String(i)}`)}
          selectedColumns={selected}
          onSelectedColumnsChange={setSelected}
        />
      );
    };
    const open = () => {
      const trigger = screen.getByRole('button', { name: /show metadata/i });
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    };
    // jsdom: a 768px window with 28px rows shows 27 items, so 54 or more get the filter.
    const { unmount } = render(<Many count={20} />);
    open();
    expect(await screen.findByRole('menuitemcheckbox', { name: 'col_0' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Filter columns by name' })).toBeNull();
    unmount();

    render(<Many count={60} />);
    open();
    const filter = await screen.findByRole('searchbox', { name: 'Filter columns by name' });
    fireEvent.change(filter, { target: { value: 'col_5' } });
    expect(screen.getAllByRole('menuitemcheckbox').map((item) => item.textContent)).toEqual([
      'Select all matching',
      'col_5',
      'col_50',
      'col_51',
      'col_52',
      'col_53',
      'col_54',
      'col_55',
      'col_56',
      'col_57',
      'col_58',
      'col_59',
    ]);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Select all matching' }));
    expect(screen.getByRole('button', { name: /show metadata/i, hidden: true })).toHaveTextContent(
      '(11)',
    );
  });
});
