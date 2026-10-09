import React from 'react';
import { fireEvent, render as renderUi, screen } from '@testing-library/react';
import { Field, Utf8 } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';

import { TopicModelingParameterPanel } from '../TopicModelingParameterPanel';
import type { WorkspaceNodeMetadata } from '@/features/workspace/common/workspaceNodeMetadata';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/uiStore';
import { useNudgeStore } from '@/features/nudges/nudgeStore';

const render = (ui: React.ReactElement) => renderUi(ui, { wrapper: TooltipProvider });

vi.mock('../../../../../../components/help/InfoIcon', () => ({
  default: () => null,
}));

vi.mock('@/features/views/common/components/NodeInputsPanel', () => ({
  NodeInputsPanel: ({
    resolvedNodes,
    renderColumnAddon,
    columnAddonWidth,
  }: {
    resolvedNodes: ReturnType<typeof nodeInputsFixture>['resolvedNodes'];
    renderColumnAddon?: (args: {
      node: ReturnType<typeof nodeInputsFixture>['resolvedNodes'][number]['node'];
      nodeId: string;
      index: number;
      color: string;
      column: string;
      columns: string[];
    }) => React.ReactNode;
    columnAddonWidth?: 'fill' | 'auto';
  }) => (
    <div data-column-addon-width={columnAddonWidth} data-testid="node-inputs-panel">
      {resolvedNodes.map((resolved, index) => (
        <div key={resolved.id} data-testid={`node-card-${resolved.id}`}>
          {renderColumnAddon?.({
            node: resolved.node,
            nodeId: resolved.id,
            index,
            color: '#2563eb',
            column: resolved.column,
            columns: resolved.columnOptions.map((column) => column.name),
          })}
        </div>
      ))}
    </div>
  ),
}));

const workspaceNodeFixture = (
  overrides: Pick<WorkspaceNodeMetadata, 'id' | 'name'>,
): WorkspaceNodeMetadata => ({
  color: null,
  document: null,
  columns: ['text'],
  schema: { text: 'String' },
  shape: undefined,
  tokenizerModel: null,
  canUndo: false,
  canRedo: false,
  ...overrides,
});

const nodeInputsFixture = (
  selectedNodeSeeds: Pick<WorkspaceNodeMetadata, 'id' | 'name'>[] = [],
) => {
  const selectedNodes = selectedNodeSeeds.map(workspaceNodeFixture);
  return {
    inputs: selectedNodes.map((node) => ({ node_id: node.id, column: 'text' })),
    resolvedNodes: selectedNodes.map((node) => ({
      id: node.id,
      name: node.name,
      node,
      column: 'text',
      columnOptions: [{ name: 'text', typeName: 'Utf8', field: new Field('text', new Utf8()) }],
    })),
    selectedNodes,
    nodeColumnSelections: selectedNodes.map((node) => ({ nodeId: node.id, column: 'text' })),
    availableNodes: [],
    canAddMore: true,
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

vi.mock('../../../../common/components/AnalysisCardLayout', () => ({
  AnalysisCardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/**
 * Used by: focused TopicModelingParameterPanel tests because the shared fixture keeps required props stable while each test overrides only the behavior under assertion.
 */
const baseProps = {
  nodeInputs: nodeInputsFixture(),
  onColumnChange: vi.fn(),
  nodeColors: {},
  onNodeColorChange: vi.fn(),
  defaultPalette: [],
  actionState: { runDisabled: false, clearDisabled: false },
  corpusSamples: [],
  nodeDocCounts: [],
  onCorpusSampleChange: vi.fn(),
  minClusterSize: 10,
  onMinClusterSizeChange: vi.fn(),
  maxClusterSize: null,
  onMaxClusterSizeChange: vi.fn(),
  lastRunClustering: null,
  clusterSample: false,
  onClusterSampleChange: vi.fn(),
  clusterSampleSize: null,
  onClusterSampleSizeChange: vi.fn(),
  suggestedSampleSize: 100_000,
  estimatedSegmentCount: 3000,
  estimatedTokenCount: 600_000,
  randomSeed: 0,
  randomSeedUserSet: false,
  onRandomSeedChange: vi.fn(),
  representativeWordsCount: 5,
  representativeWordsCountUserSet: false,
  onRepresentativeWordsCountChange: vi.fn(),
  segmentationMethod: 'automatic' as const,
  onSegmentationMethodChange: vi.fn(),
  maxSegmentTokens: 256,
  onMaxSegmentTokensChange: vi.fn(),
  isRunning: false,
  isClearing: false,
  onRun: vi.fn(),
  onClear: vi.fn(),
  hasMissingColumns: false,
};

describe('TopicModelingParameterPanel', () => {
  it('renders run parameters without result-only words per topic', () => {
    render(<TopicModelingParameterPanel {...baseProps} />);

    expect(screen.getByLabelText('Random seed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Words per topic')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Segmentation method')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum tokens per segment')).toHaveValue(256);
    expect(screen.getByLabelText('Min topic size')).toHaveValue(10);
    expect(screen.queryByText('Topic Modelling Options')).not.toBeInTheDocument();
  });

  it('opens the tutorial section from each parameter help icon', () => {
    render(<TopicModelingParameterPanel {...baseProps} />);

    for (const [label, anchor] of [
      ['About Segments', 'help-topic-modeling-segmentation-method'],
      ['About Max tokens', 'help-topic-modeling-max-segment-tokens'],
      ['About Topic size', 'help-topic-modeling-min-cluster-size'],
      ['About Seed', 'help-topic-modeling-random-seed'],
      ['About Topic sampling', 'help-topic-modeling-topic-sampling'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(useUIStore.getState().documentTarget).toMatchObject({
        file: 'tutorials/topic-modeling.md',
        anchor,
      });
    }
  });

  it('keeps help open-able while a run locks the parameters', () => {
    // AnalysisCardLayout (mocked here) wraps the parameters in this fieldset.
    render(
      <fieldset disabled>
        <TopicModelingParameterPanel {...baseProps} parametersLocked clusterSample />
      </fieldset>,
    );

    expect(screen.getByLabelText('Random seed')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'About Topic size' }));
    expect(useUIStore.getState().documentTarget).toMatchObject({
      anchor: 'help-topic-modeling-min-cluster-size',
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'About Seed' }), { key: ' ' });
    expect(useUIStore.getState().documentTarget).toMatchObject({
      anchor: 'help-topic-modeling-random-seed',
    });
  });

  it('commits maximum tokens per segment within the supported model window', () => {
    const onMaxSegmentTokensChange = vi.fn();
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        onMaxSegmentTokensChange={onMaxSegmentTokensChange}
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>('Maximum tokens per segment');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(onMaxSegmentTokensChange).toHaveBeenLastCalledWith(32);

    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.blur(input);
    expect(onMaxSegmentTokensChange).toHaveBeenLastCalledWith(256);
  });

  it('renders percentage sampling inside the selected node card', () => {
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        nodeInputs={nodeInputsFixture([{ id: 'n1', name: 'Corpus A' }])}
        corpusSamples={[{ percent: '100' }]}
        nodeDocCounts={[8000]}
      />,
    );

    expect(screen.getByLabelText('Sampling (8,000 documents)')).toHaveValue(100);
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(screen.getByTestId('node-inputs-panel')).toHaveAttribute(
      'data-column-addon-width',
      'auto',
    );
    expect(screen.getByTestId('topic-sampling-control')).toHaveClass('w-full');
    expect(screen.getByTestId('topic-sampling-wrapper')).toHaveClass('inline-grid', 'w-max');
    expect(screen.queryByText('Data Block Sampling')).not.toBeInTheDocument();
  });

  it('forwards sampling percentage edits from the node card', () => {
    const onCorpusSampleChange = vi.fn();

    render(
      <TopicModelingParameterPanel
        {...baseProps}
        nodeInputs={nodeInputsFixture([{ id: 'n1', name: 'Corpus A' }])}
        corpusSamples={[{ percent: '50' }]}
        nodeDocCounts={[8000]}
        onCorpusSampleChange={onCorpusSampleChange}
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>('Sampling (4,000 documents)');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);

    expect(onCorpusSampleChange).toHaveBeenCalledWith(0, { percent: '25' });
  });

  it('commits Min topic size as an integer of at least two', () => {
    const onMinClusterSizeChange = vi.fn();
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        onMinClusterSizeChange={onMinClusterSizeChange}
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>('Min topic size');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.blur(input);
    expect(onMinClusterSizeChange).toHaveBeenLastCalledWith(2);

    fireEvent.change(input, { target: { value: '25.4' } });
    fireEvent.blur(input);
    expect(onMinClusterSizeChange).toHaveBeenLastCalledWith(25);
  });

  it('shows Max topic size as Auto and commits fixed values or Auto', () => {
    const onMaxClusterSizeChange = vi.fn();
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        onMaxClusterSizeChange={onMaxClusterSizeChange}
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>('Max topic size');
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('placeholder', 'Auto');

    fireEvent.change(input, { target: { value: '300.4' } });
    fireEvent.blur(input);
    expect(onMaxClusterSizeChange).toHaveBeenLastCalledWith(300);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onMaxClusterSizeChange).toHaveBeenLastCalledWith(null);
  });

  it('flags a Max topic size that is not larger than Min topic size', () => {
    render(<TopicModelingParameterPanel {...baseProps} minClusterSize={10} maxClusterSize={10} />);

    expect(screen.getByText('Max must be larger than Min')).toBeInTheDocument();
    expect(screen.getByLabelText('Max topic size')).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports the last run segment count and the cap Auto applied', () => {
    const { rerender } = render(
      <TopicModelingParameterPanel
        {...baseProps}
        lastRunClustering={{
          segmentCount: 4047,
          appliedMaxTopicSize: null,
          requestedMaxTopicSize: null,
          clusteredSegments: null,
          randomSeed: 0,
          autoDecision: null,
          autoDocumentShare: null,
          largestTopicSize: null,
        }}
      />,
    );
    expect(
      screen.getByText('Last run: 4,047 segments; no topic needed splitting'),
    ).toBeInTheDocument();

    rerender(
      <TopicModelingParameterPanel
        {...baseProps}
        lastRunClustering={{
          segmentCount: 4047,
          appliedMaxTopicSize: 1540,
          requestedMaxTopicSize: null,
          clusteredSegments: null,
          randomSeed: 0,
          autoDecision: null,
          autoDocumentShare: null,
          largestTopicSize: null,
        }}
      />,
    );
    expect(
      screen.getByText('Last run: 4,047 segments; topics larger than 1,540 were split'),
    ).toBeInTheDocument();
  });

  it('shows the size Auto worked with in grey, and Tab fills it in', () => {
    const onMaxClusterSizeChange = vi.fn();
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        onMaxClusterSizeChange={onMaxClusterSizeChange}
        lastRunClustering={{
          segmentCount: 107_551,
          appliedMaxTopicSize: null,
          requestedMaxTopicSize: null,
          clusteredSegments: null,
          randomSeed: 0,
          autoDecision: 'not_needed',
          autoDocumentShare: 0.02,
          largestTopicSize: 1540,
        }}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Max topic size');
    expect(input).toHaveAttribute('placeholder', '1540');
    expect(input).toHaveValue(null);

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue(1540);
    fireEvent.blur(input);
    expect(onMaxClusterSizeChange).toHaveBeenLastCalledWith(1540);
  });

  it('shows Auto before any run', () => {
    render(<TopicModelingParameterPanel {...baseProps} />);
    expect(screen.getByLabelText('Max topic size')).toHaveAttribute('placeholder', 'Auto');
  });

  it('explains what Auto max topic size decided, in documents', () => {
    const lastRun = {
      segmentCount: 107_551,
      appliedMaxTopicSize: null,
      requestedMaxTopicSize: null,
      clusteredSegments: null,
      randomSeed: 0,
      largestTopicSize: 1540,
    };
    const { rerender } = render(
      <TopicModelingParameterPanel
        {...baseProps}
        lastRunClustering={{ ...lastRun, autoDecision: 'not_needed', autoDocumentShare: 0.31 }}
      />,
    );
    expect(
      screen.getByText(
        'Last run: 107,551 segments; no topic was the main topic of more than half of the documents, so none was split; the largest topic has 1,540 segments',
      ),
    ).toBeInTheDocument();

    rerender(
      <TopicModelingParameterPanel
        {...baseProps}
        lastRunClustering={{
          ...lastRun,
          appliedMaxTopicSize: 1540,
          autoDecision: 'split',
          autoDocumentShare: 0.834,
        }}
      />,
    );
    expect(
      screen.getByText(
        'Last run: 107,551 segments; one topic was the main topic of 83% of documents, so topics larger than 1,540 segments were split',
      ),
    ).toBeInTheDocument();

    rerender(
      <TopicModelingParameterPanel
        {...baseProps}
        lastRunClustering={{ ...lastRun, autoDecision: 'kept', autoDocumentShare: 0.9 }}
      />,
    );
    expect(
      screen.getByText(/main topic of 90% of documents, but splitting it left/),
    ).toHaveTextContent('so it was kept. Try a fixed Max topic size');
  });

  it('reports a last run whose topics came from a sample', () => {
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        lastRunClustering={{
          segmentCount: 105_000,
          appliedMaxTopicSize: null,
          requestedMaxTopicSize: null,
          clusteredSegments: 20_000,
          randomSeed: 7,
          autoDecision: null,
          autoDocumentShare: null,
          largestTopicSize: null,
        }}
      />,
    );
    expect(
      screen.getByText(
        'Last run: 105,000 segments; topics found from a sample of 20,000 (seed 7); no topic needed splitting',
      ),
    ).toBeInTheDocument();
  });

  it('explains topic sampling with its seed, trade-off and help link', () => {
    const onClusterSampleChange = vi.fn();
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        clusterSample
        onClusterSampleChange={onClusterSampleChange}
        estimatedSegmentCount={400_000}
        randomSeed={3}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Topic sampling' })).toBeChecked();
    const note = screen.getByText(/Topics are found from 100,000 of about 400,000 segments/);
    expect(note).toHaveTextContent('picked with seed 3');
    // Min topic size 10 x 400,000 / 100,000.
    expect(note).toHaveTextContent('topics smaller than about 40 segments may be missed');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Topic sampling' }));
    expect(onClusterSampleChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(useUIStore.getState().documentTarget).toMatchObject({
      file: 'tutorials/topic-modeling.md',
      anchor: 'help-topic-modeling-topic-sampling',
    });
  });

  it('shows the suggested sample in grey; Tab fills it, typing replaces it', () => {
    const onClusterSampleSizeChange = vi.fn();
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        clusterSample
        estimatedSegmentCount={400_000}
        onClusterSampleSizeChange={onClusterSampleSizeChange}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Segments to sample');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '100,000');

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('100,000');
    fireEvent.blur(input);
    expect(onClusterSampleSizeChange).toHaveBeenLastCalledWith(100_000);

    fireEvent.change(input, { target: { value: '50000' } });
    fireEvent.blur(input);
    expect(onClusterSampleSizeChange).toHaveBeenLastCalledWith(50_000);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onClusterSampleSizeChange).toHaveBeenLastCalledWith(null);
  });

  it('suggests topic sampling, unticked, when a corpus has very many segments', () => {
    // With Suggestions off, the note carries the advice (issue 360).
    useNudgeStore.setState({ enabled: false });
    render(<TopicModelingParameterPanel {...baseProps} estimatedSegmentCount={400_000} />);

    expect(screen.getByRole('checkbox', { name: 'Topic sampling' })).not.toBeChecked();
    expect(screen.queryByLabelText('Segments to sample')).not.toBeInTheDocument();
    expect(screen.getByText(/this run may take a long time/)).toHaveClass('text-warning');
    useNudgeStore.setState({ enabled: true });
  });

  it('leaves the advice to the suggestion and keeps grey facts (issue 360)', () => {
    render(
      <TopicModelingParameterPanel
        {...baseProps}
        estimatedSegmentCount={400_000}
        estimatedTokenCount={25_000_000}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('A large input');
    expect(
      screen.getByText(/About 400,000 segments; clustering time grows with the square/),
    ).toHaveClass('text-description');
    const firstRun = screen.getByText(/About 25 million tokens to read/);
    expect(firstRun).toHaveClass('text-description');
    expect(firstRun).not.toHaveTextContent('Lower the sampling percentage');
  });

  it('says every segment is clustered when sampling is on but the corpus is small', () => {
    render(<TopicModelingParameterPanel {...baseProps} clusterSample />);

    expect(
      screen.getByText(
        /about 3,000 segments, no more than the sample, so every segment is clustered/,
      ),
    ).toBeInTheDocument();
  });

  it('shows the estimated segment count with sampling off', () => {
    render(<TopicModelingParameterPanel {...baseProps} />);

    expect(
      screen.getByText(/About 3,000 segments \(estimated\); every segment is clustered/),
    ).toHaveClass('text-description');
  });

  it('warns about a long first run under the Data Blocks for a large corpus', () => {
    const { rerender } = render(
      <TopicModelingParameterPanel {...baseProps} estimatedTokenCount={25_000_000} />,
    );
    // Minutes are for a fast computer, not a promise (Chao, issue 360).
    expect(screen.getByText(/About 25 million tokens to read/)).toHaveTextContent(
      'about 12 minutes on a fast recent computer, and often several times longer on older or slower ones',
    );

    rerender(<TopicModelingParameterPanel {...baseProps} estimatedTokenCount={4_000_000} />);
    expect(screen.queryByText(/tokens to read/)).not.toBeInTheDocument();
  });

  it('shows no sampling note while the segments are being counted', () => {
    render(<TopicModelingParameterPanel {...baseProps} estimatedSegmentCount={null} />);

    expect(screen.queryByRole('button', { name: 'Learn more' })).not.toBeInTheDocument();
  });
});
