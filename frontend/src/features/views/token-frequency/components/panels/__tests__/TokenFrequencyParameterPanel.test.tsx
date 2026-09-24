import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Field, Utf8 } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';

import { TokenFrequencyParameterPanel } from '../TokenFrequencyParameterPanel';
import type { UseTabNodeInputsResult } from '@/features/views/common/nodeInputs';
import { projectWorkspaceNodeMetadata } from '@/features/workspace/common/workspaceNodeMetadata';

vi.mock('@/components/help/HelpIcon', () => ({
  // Used by: panel tests so help widgets do not add tooltip behavior to layout assertions.
  default: () => null,
}));

vi.mock('@/features/views/common/components/AnalysisCardLayout', () => ({
  // Used by: parameter-panel tests to expose actions and children without card chrome.
  AnalysisCardLayout: ({
    actions,
    children,
  }: {
    actions?: { extraContent?: React.ReactNode };
    children: React.ReactNode;
  }) => (
    <section>
      <div data-testid="action-extra">{actions?.extraContent}</div>
      {children}
    </section>
  ),
}));

vi.mock('@/features/views/common/components/NodeInputsPanel', () => ({
  // Used by: placement tests as the stable boundary for the selected-node selector.
  NodeInputsPanel: ({
    resolvedNodes,
    unavailableNodes,
    inputOrder,
    nodeColors,
    renderExtraNodeContent,
  }: {
    resolvedNodes: {
      id: string;
      node: { id: string; name: string };
      column: string;
      columnOptions: { name: string }[];
    }[];
    unavailableNodes?: { id: string; name: string; column?: string }[];
    inputOrder?: string[];
    nodeColors?: Record<string, string>;
    renderExtraNodeContent?: (args: {
      node: { id: string; name: string };
      nodeId: string;
      index: number;
      color: string;
      column: string;
      columns: string[];
    }) => React.ReactNode;
  }) => (
    <div data-testid="node-inputs-panel">
      {resolvedNodes.map((resolved, index) => (
        <div key={resolved.id} data-testid={`node-card-${resolved.id}`}>
          {renderExtraNodeContent?.({
            node: resolved.node,
            nodeId: resolved.id,
            index,
            color: nodeColors?.[resolved.id] ?? '#000000',
            column: resolved.column,
            columns: resolved.columnOptions.map((column) => column.name),
          })}
        </div>
      ))}
      {unavailableNodes?.map((node) => (
        <div key={node.id} data-testid={`unavailable-node-${node.id}`}>
          {node.name} · {node.column}
        </div>
      ))}
      <div data-testid="input-order">{inputOrder?.join('|')}</div>
    </div>
  ),
}));

const nodeInputsFixture = (): UseTabNodeInputsResult => {
  const nodeA = projectWorkspaceNodeMetadata({ id: 'node-a', name: 'Corpus A' });
  const nodeB = projectWorkspaceNodeMetadata({ id: 'node-b', name: 'Corpus B' });
  return {
    inputs: [
      { node_id: 'node-a', column: 'text' },
      { node_id: 'node-b', column: 'text' },
    ],
    resolvedNodes: [
      {
        id: 'node-a',
        name: 'Corpus A',
        node: nodeA,
        column: 'text',
        columnOptions: [{ name: 'text', typeName: 'Utf8', field: new Field('text', new Utf8()) }],
      },
      {
        id: 'node-b',
        name: 'Corpus B',
        node: nodeB,
        column: 'text',
        columnOptions: [{ name: 'text', typeName: 'Utf8', field: new Field('text', new Utf8()) }],
      },
    ],
    selectedNodes: [nodeA, nodeB],
    nodeColumnSelections: [
      { nodeId: 'node-a', column: 'text' },
      { nodeId: 'node-b', column: 'text' },
    ],
    availableNodes: [],
    canAddMore: false,
    addNodes: vi.fn(() => []),
    removeNode: vi.fn(),
    clear: vi.fn(),
    setColumn: vi.fn(),
    workspaceId: 'workspace-1',
    nodeInfoById: {},
    getColumnInfos: vi.fn(() => []),
    getNodeInfo: vi.fn(() => undefined),
  };
};

const baseProps = {
  nodeInputs: nodeInputsFixture(),
  onColumnChange: vi.fn(),
  actionState: { runDisabled: false, clearDisabled: false },
  isAnalyzing: false,
  onAnalyze: vi.fn(),
  onStop: vi.fn(),
  isStopping: false,
  onClearResults: vi.fn(),
  hasIncompleteSelections: false,
  studyNodeId: 'node-a',
  onStudyNodeChange: vi.fn(),
  nodeColors: { 'node-a': '#2563eb', 'node-b': '#dc2626' },
  onNodeColorChange: vi.fn(),
  computeDisplayName: (nodeId: string) => (nodeId === 'node-a' ? 'Corpus A' : 'Corpus B'),
};

describe('TokenFrequencyParameterPanel', () => {
  it('renders linked "Use as Study Corpus" toggles with the first corpus on by default', () => {
    const onStudyNodeChange = vi.fn();
    render(<TokenFrequencyParameterPanel {...baseProps} onStudyNodeChange={onStudyNodeChange} />);

    expect(screen.queryByRole('radiogroup', { name: 'Study Data Block' })).not.toBeInTheDocument();
    expect(screen.getByTestId('action-extra')).toBeEmptyDOMElement();

    const cardA = within(screen.getByTestId('node-card-node-a'));
    const cardB = within(screen.getByTestId('node-card-node-b'));
    expect(cardA.getByText('Use as Study Corpus')).toBeInTheDocument();
    expect(cardB.getByText('Use as Study Corpus')).toBeInTheDocument();
    expect(screen.queryByText('Reference Corpus')).not.toBeInTheDocument();

    const corpusASwitch = cardA.getByRole('switch', { name: 'Use Corpus A as Study Corpus' });
    const corpusBSwitch = cardB.getByRole('switch', { name: 'Use Corpus B as Study Corpus' });
    expect(corpusASwitch).toHaveAttribute('aria-checked', 'true');
    expect(corpusBSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(corpusBSwitch);
    expect(onStudyNodeChange).toHaveBeenLastCalledWith('node-b');

    // Turning the active toggle off hands the Study role to the other corpus.
    fireEvent.click(corpusASwitch);
    expect(onStudyNodeChange).toHaveBeenLastCalledWith('node-b');

    fireEvent.click(cardB.getByText('Use as Study Corpus'));
    expect(onStudyNodeChange).toHaveBeenLastCalledWith('node-b');
  });

  it('turns the first corpus on when no study corpus has been chosen', () => {
    render(<TokenFrequencyParameterPanel {...baseProps} studyNodeId={null} />);

    expect(screen.getByRole('switch', { name: 'Use Corpus A as Study Corpus' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Use Corpus B as Study Corpus' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows the selected study corpus as the only active toggle', () => {
    render(<TokenFrequencyParameterPanel {...baseProps} studyNodeId="node-b" />);

    expect(screen.getByRole('switch', { name: 'Use Corpus A as Study Corpus' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: 'Use Corpus B as Study Corpus' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('projects a deleted saved input with its historical result name', () => {
    const nodeInputs = nodeInputsFixture();
    const remainingNode = nodeInputs.resolvedNodes[1];
    if (!remainingNode) throw new Error('Expected the second fixture node.');
    nodeInputs.resolvedNodes = [remainingNode];
    nodeInputs.selectedNodes = [remainingNode.node];
    nodeInputs.nodeColumnSelections = [{ nodeId: remainingNode.id, column: remainingNode.column }];

    render(<TokenFrequencyParameterPanel {...baseProps} nodeInputs={nodeInputs} />);

    expect(screen.getByTestId('unavailable-node-node-a')).toHaveTextContent('Corpus A · text');
    expect(screen.getByTestId('input-order')).toHaveTextContent('node-a|node-b');
  });
});
