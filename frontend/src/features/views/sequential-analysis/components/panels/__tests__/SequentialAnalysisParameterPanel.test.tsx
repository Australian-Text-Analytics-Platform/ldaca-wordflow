import { render, screen } from '@testing-library/react';
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

const renderPanel = (groupByColumns: string[]) =>
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
      groupByColumns={groupByColumns}
      onAddGroupByColumn={vi.fn()}
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

  it('shows plain type names for every column in group-by options (issue 205)', async () => {
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

    expect(screen.getByRole('option', { name: 'count (whole number)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'score (decimal)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'legacy_text (text)' })).toBeInTheDocument();
  });

  it('does not offer a column already chosen in another Group By row (issue 212)', async () => {
    const user = userEvent.setup();
    renderPanel(['count', '']);

    await user.click(screen.getAllByRole('combobox')[1]!);

    expect(screen.queryByRole('option', { name: 'count (whole number)' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'score (decimal)' })).toBeInTheDocument();
  });
});
