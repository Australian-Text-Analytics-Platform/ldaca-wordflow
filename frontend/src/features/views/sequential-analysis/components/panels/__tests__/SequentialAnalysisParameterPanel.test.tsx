import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Float64, Int64, Utf8 } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';

import type { UseTabNodeInputsResult } from '@/features/views/common/nodeInputs';
import { ToolModeContext } from '@/features/views/common/toolMode/ToolModeContext';
import { SequentialAnalysisParameterPanel } from '../SequentialAnalysisParameterPanel';

vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
vi.mock('@/features/views/common/components/NodeInputsPanel', () => ({
  NodeInputsPanel: () => null,
}));
vi.mock('../../UniqueValueCount', () => ({ UniqueValueCount: () => null }));
vi.mock('../SequentialReferencePanel', () => ({
  SequentialReferencePanel: () => <div data-testid="reference-panel" />,
}));

const reference = {
  nodes: [],
  timeColumn: 'date',
  referenceNodeId: '',
  onReferenceChange: vi.fn(),
  referenceTextColumn: '',
  onReferenceTextColumnChange: vi.fn(),
  referenceTokenizerModel: '',
  onReferenceTokenizerModelChange: vi.fn(),
};

window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const renderPanel = (
  groupByColumns: string[],
  groupColumnValueCounts?: Record<string, number>,
  onAddGroupByColumn = vi.fn(),
) =>
  render(
    <SequentialAnalysisParameterPanel
      nodeInputs={{} as UseTabNodeInputsResult}
      onColumnChange={vi.fn()}
      derivedColumnType="numeric"
      inputsDisabled={false}
      activeNodeId="node-1"
      selectedNodeId="node-1"
      currentWorkspaceId="workspace-1"
      frequency="daily"
      onFrequencyChange={vi.fn()}
      customIntervalValueInput="1"
      onCustomIntervalValueChange={vi.fn()}
      customIntervalUnit="days"
      onCustomIntervalUnitChange={vi.fn()}
      numericOriginInput=""
      onNumericOriginChange={vi.fn()}
      numericIntervalInput="1"
      onNumericIntervalChange={vi.fn()}
      availableColumns={[
        {
          name: 'count',
          typeName: 'Int64',
          field: new Field('count', new Int64()),
        },
        {
          name: 'score',
          typeName: 'Float64',
          field: new Field('score', new Float64()),
        },
        {
          name: 'legacy_text',
          typeName: 'Utf8',
          field: new Field('legacy_text', new Utf8()),
        },
      ]}
      groupColumnValueCounts={groupColumnValueCounts}
      groupByColumns={groupByColumns}
      onAddGroupByColumn={onAddGroupByColumn}
      onRemoveGroupByColumn={vi.fn()}
      onGroupByColumnChange={vi.fn()}
      reference={reference}
    />,
  );

describe('SequentialAnalysisParameterPanel', () => {
  it('shows the reference Data Block settings only in Advanced', () => {
    const { unmount } = renderPanel([]);
    expect(screen.queryByTestId('reference-panel')).not.toBeInTheDocument();
    unmount();
    render(
      <ToolModeContext value={{ advanced: true, setAdvanced: vi.fn() }}>
        <SequentialAnalysisParameterPanel
          nodeInputs={{} as UseTabNodeInputsResult}
          onColumnChange={vi.fn()}
          derivedColumnType="numeric"
          inputsDisabled={false}
          activeNodeId="node-1"
          selectedNodeId="node-1"
          currentWorkspaceId="workspace-1"
          frequency="daily"
          onFrequencyChange={vi.fn()}
          customIntervalValueInput="1"
          onCustomIntervalValueChange={vi.fn()}
          customIntervalUnit="days"
          onCustomIntervalUnitChange={vi.fn()}
          numericOriginInput=""
          onNumericOriginChange={vi.fn()}
          numericIntervalInput="1"
          onNumericIntervalChange={vi.fn()}
          availableColumns={[]}
          groupByColumns={[]}
          onAddGroupByColumn={vi.fn()}
          onRemoveGroupByColumn={vi.fn()}
          onGroupByColumnChange={vi.fn()}
          reference={reference}
        />
      </ToolModeContext>,
    );
    expect(screen.getByRole('group', { name: 'Advanced settings' })).toContainElement(
      screen.getByTestId('reference-panel'),
    );
  });

  it('shows every column in group-by options behind its type symbol, named in plain words (issue 205)', async () => {
    const user = userEvent.setup();

    render(
      <SequentialAnalysisParameterPanel
        nodeInputs={{} as UseTabNodeInputsResult}
        onColumnChange={vi.fn()}
        derivedColumnType="numeric"
        inputsDisabled={false}
        activeNodeId="node-1"
        selectedNodeId="node-1"
        currentWorkspaceId="workspace-1"
        frequency="daily"
        onFrequencyChange={vi.fn()}
        customIntervalValueInput="1"
        onCustomIntervalValueChange={vi.fn()}
        customIntervalUnit="days"
        onCustomIntervalUnitChange={vi.fn()}
        numericOriginInput=""
        onNumericOriginChange={vi.fn()}
        numericIntervalInput="1"
        onNumericIntervalChange={vi.fn()}
        availableColumns={[
          {
            name: 'count',
            typeName: 'Int64',
            field: new Field('count', new Int64()),
          },
          {
            name: 'score',
            typeName: 'Float64',
            field: new Field('score', new Float64()),
          },
          {
            name: 'legacy_text',
            typeName: 'Utf8',
            field: new Field('legacy_text', new Utf8()),
          },
        ]}
        groupByColumns={['']}
        onAddGroupByColumn={vi.fn()}
        onRemoveGroupByColumn={vi.fn()}
        onGroupByColumnChange={vi.fn()}
        reference={reference}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    const count = screen.getByRole('option', { name: 'count' });
    expect(within(count).getByTitle('whole number')).toHaveTextContent('123');
    const score = screen.getByRole('option', { name: 'score' });
    expect(within(score).getByTitle('decimal')).toHaveTextContent('1.2');
    const legacy = screen.getByRole('option', { name: 'legacy_text' });
    expect(within(legacy).getByTitle('text')).toHaveTextContent('Aa');
  });

  it('does not offer a column already chosen in another Group By row (issue 212)', async () => {
    const user = userEvent.setup();
    renderPanel(['count', '']);

    await user.click(screen.getAllByRole('combobox')[1]!);

    expect(screen.queryByRole('option', { name: 'count' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'score' })).toBeInTheDocument();
  });

  it('offers only columns with few enough different values, with that number', async () => {
    const user = userEvent.setup();
    renderPanel([''], { count: 3, legacy_text: 1 });

    await user.click(screen.getByRole('combobox'));

    const counted = screen.getByRole('option', { name: 'count (3 values)' });
    expect(within(counted).getByTitle('whole number')).toHaveTextContent('123');
    expect(screen.getByRole('option', { name: 'legacy_text (1 value)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^score/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says so when no column has few enough values, and Add group is off', () => {
    renderPanel([], {});

    expect(screen.getByRole('note')).toHaveTextContent(
      'No column in this Data Block has 16 or fewer different values, so there is nothing to group by.',
    );
    expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
  });

  it('keeps Add group on until every offered column is chosen', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { unmount } = renderPanel(['count'], { count: 3, legacy_text: 1 }, onAdd);

    await user.click(screen.getByRole('button', { name: 'Add group' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    unmount();

    renderPanel(['count', 'legacy_text'], { count: 3, legacy_text: 1 });
    expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('still shows a chosen column that has too many values', async () => {
    const user = userEvent.setup();
    renderPanel(['score'], { count: 3 });

    expect(screen.getByRole('combobox')).toHaveTextContent('score');
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'score' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'count (3 values)' })).toBeInTheDocument();
  });

  it('lists every column while the numbers of values are not known', async () => {
    const user = userEvent.setup();
    renderPanel(['']);

    expect(screen.getByRole('button', { name: 'Add group' })).toBeEnabled();
    await user.click(screen.getByRole('combobox'));

    expect(screen.getAllByRole('option')).toHaveLength(3);
  });
});
