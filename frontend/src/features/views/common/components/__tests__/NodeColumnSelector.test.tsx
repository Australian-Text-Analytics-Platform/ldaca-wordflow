import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateDay, Field, Float64, Int64, Utf8 } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';

import { NodeColumnSelector } from '../NodeColumnSelector';

const WIDE_COLUMNS = ['speaker_id', 'Speaker_Name', 'utterance_text', 'utterance.count', 'notes'];

describe('NodeColumnSelector', () => {
  it('renders an empty disabled dropdown when no columns are available', () => {
    render(
      <NodeColumnSelector
        columns={[]}
        label="Text column"
        noColumnsMessage="No text columns available"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Text column')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveTextContent('No text columns available');
  });

  it('shows each column type as the Data Editor symbol, in the list and once chosen', async () => {
    const user = userEvent.setup();
    const fields = new Map([
      ['text', new Field('text', new Utf8())],
      ['year', new Field('year', new Int64())],
      ['score', new Field('score', new Float64())],
      ['day', new Field('day', new DateDay())],
    ]);
    const { rerender } = render(
      <NodeColumnSelector
        columns={['text', 'year', 'score', 'day', 'untyped']}
        columnFields={fields}
        label="Column"
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    // The option keeps the column's name; the type is its symbol, hover text
    // and description.
    const year = screen.getByRole('option', { name: 'year' });
    expect(within(year).getByTitle('whole number')).toHaveTextContent('123');
    expect(year).toHaveAccessibleDescription('whole number');
    expect(
      within(screen.getByRole('option', { name: 'text' })).getByTitle('text'),
    ).toHaveTextContent('Aa');
    expect(
      within(screen.getByRole('option', { name: 'score' })).getByTitle('decimal'),
    ).toHaveTextContent('1.2');
    expect(screen.getByRole('option', { name: 'day' })).toHaveAccessibleDescription('date');
    // A column whose type is not known shows its name alone.
    expect(screen.getByRole('option', { name: 'untyped' })).not.toHaveAccessibleDescription();

    // Filtering still goes by the name, not by the symbol.
    await user.type(screen.getByRole('searchbox'), '123');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    await user.keyboard('{Escape}');

    rerender(
      <NodeColumnSelector
        columns={['text', 'year', 'score', 'day', 'untyped']}
        columnFields={fields}
        value="score"
        label="Column"
        onChange={vi.fn()}
      />,
    );
    expect(within(screen.getByRole('combobox')).getByTitle('decimal')).toHaveTextContent('1.2');
    expect(screen.getByRole('combobox')).toHaveTextContent('score');
  });

  it('filters the options by substring as the user types', async () => {
    const user = userEvent.setup();
    render(<NodeColumnSelector columns={WIDE_COLUMNS} label="Text column" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(WIDE_COLUMNS.length);

    await user.type(screen.getByRole('searchbox'), 'speaker');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'speaker_id',
      'Speaker_Name',
    ]);
  });

  it('filters by anchored wildcard patterns', async () => {
    const user = userEvent.setup();
    render(<NodeColumnSelector columns={WIDE_COLUMNS} label="Text column" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('searchbox'), 'utterance*');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'utterance_text',
      'utterance.count',
    ]);
  });

  it('reports the match count and an empty state for a query that matches nothing', async () => {
    const user = userEvent.setup();
    render(<NodeColumnSelector columns={WIDE_COLUMNS} label="Text column" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');

    expect(screen.getByText('0 of 5 match')).toBeInTheDocument();
    expect(screen.getByText('No matching columns')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('commits the highlighted match on Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NodeColumnSelector columns={WIDE_COLUMNS} label="Text column" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('searchbox'), 'utterance_');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('utterance_text');
  });

  it('commits a clicked option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NodeColumnSelector columns={WIDE_COLUMNS} label="Text column" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'notes' }));

    expect(onChange).toHaveBeenCalledWith('notes');
  });

  it('offers the clear row only while the list is unfiltered', async () => {
    const user = userEvent.setup();
    render(
      <NodeColumnSelector
        columns={WIDE_COLUMNS}
        label="Text column"
        clearOptionValue="__clear__"
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'Select column…' })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'notes');
    expect(screen.queryByRole('option', { name: 'Select column…' })).not.toBeInTheDocument();
  });

  it('narrows a spreadsheet-scale column list to a selectable handful', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const wideSheet = Array.from({ length: 596 }, (_, index) => `q${String(index)}_response`);
    render(<NodeColumnSelector columns={wideSheet} label="Text column" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(596);

    await user.type(screen.getByRole('searchbox'), 'q59?_response');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'q590_response',
      'q591_response',
      'q592_response',
      'q593_response',
      'q594_response',
      'q595_response',
    ]);

    await user.click(screen.getByRole('option', { name: 'q593_response' }));
    expect(onChange).toHaveBeenCalledWith('q593_response');
  });

  it('keeps a saved column selectable after it disappears from the block', async () => {
    const user = userEvent.setup();
    render(
      <NodeColumnSelector
        columns={WIDE_COLUMNS}
        value="removed_column"
        preserveValue="removed_column"
        label="Text column"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('removed_column');

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'removed_column' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('leaves the picker instead of tabbing through every option', async () => {
    const user = userEvent.setup();
    render(
      <>
        <NodeColumnSelector columns={WIDE_COLUMNS} label="Text column" onChange={vi.fn()} />
        <button type="button">After selector</button>
      </>,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('searchbox')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'After selector' })).toHaveFocus();
  });
});
