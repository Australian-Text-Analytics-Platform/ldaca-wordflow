import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { NodeInputPointerCarrier } from '@/components/layout/NodeInputPointerCarrier';
import { useNodeInputRequestsStore } from '@/stores/nodeInputRequestsStore';
import { NodeInputsPanel } from '../../components/NodeInputsPanel';
import type { NodeInput } from '../nodeInputsCore';
import { useNodeInputs } from '../useNodeInputs';
import { useNodeInputRequests } from '../useNodeInputRequests';

const nodes = ['a', 'b'].map((id) => ({
  id,
  name: id,
  color: null,
  document: null,
  tokenizerModel: null,
}));
function Area({
  title,
  multiple = false,
  enabled = true,
}: {
  title: string;
  multiple?: boolean;
  enabled?: boolean;
}) {
  const [value, onChange] = useState<NodeInput[]>([]);
  const picker = useNodeInputs({ value, onChange, allNodes: nodes, constraints: { maxNodes: 1 } });
  const requests = useNodeInputRequests({
    scopeId: '',
    tool: 'inputs',
    addNodes: picker.addNodes,
    deferPlacement: multiple,
    enabled,
  });
  return (
    <section aria-label={title}>
      <NodeInputsPanel
        {...requests}
        title={title}
        resolvedNodes={picker.resolvedNodes}
        availableNodes={picker.availableNodes}
        canAddMore={picker.canAddMore}
        maxNodes={1}
        onAddNodes={picker.addNodes}
        onRemoveNode={picker.removeNode}
        onClear={picker.clear}
        onColumnChange={picker.setColumn}
        showColumnPicker={false}
      />
    </section>
  );
}
beforeEach(() => useNodeInputRequestsStore.setState({ nextId: 1, pendingRequests: [] }));

it('adds immediately in a single native area, without replaying in StrictMode', () => {
  useNodeInputRequestsStore.getState().requestAdd('', 'inputs', 'a', { x: 10, y: 20 });
  render(
    <StrictMode>
      <Area title="Source" />
      <NodeInputPointerCarrier scopeId="" tool="inputs" nodes={nodes} />
    </StrictMode>,
  );
  expect(screen.getByText('a')).toBeVisible();
  expect(useNodeInputRequestsStore.getState().pendingRequests).toEqual([]);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('carries a stack to the pointer and places only the latest node in the chosen area', async () => {
  render(
    <>
      <Area title="Source" multiple />
      <Area title="Labels" multiple />
      <NodeInputPointerCarrier scopeId="" tool="inputs" nodes={nodes} />
    </>,
  );
  act(() => {
    useNodeInputRequestsStore.getState().requestAdd('', 'inputs', 'a', { x: 10, y: 20 });
    useNodeInputRequestsStore.getState().requestAdd('', 'inputs', 'b', { x: 30, y: 40 });
  });
  const carrier = screen.getByRole('status', { name: 'Carrying 2 Data Blocks' });
  fireEvent.pointerMove(window, { clientX: 100, clientY: 120 });
  expect(carrier).toHaveStyle({ left: '116px', top: '136px' });
  await userEvent.click(screen.getByRole('button', { name: 'Add to Labels' }));
  expect(within(screen.getByRole('region', { name: 'Labels' })).getByText('b')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Labels is already filled' })).toBeDisabled();
  expect(screen.getByRole('status', { name: 'Carrying 1 Data Block' })).toHaveTextContent('a');
  await userEvent.click(screen.getByRole('button', { name: 'Add to Source' }));
  expect(within(screen.getByRole('region', { name: 'Source' })).getByText('a')).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('does not let inactive areas or another connection consume an addition', () => {
  useNodeInputRequestsStore.getState().requestAdd('other', 'inputs', 'a');
  useNodeInputRequestsStore.getState().requestAdd('', 'other-tool', 'b');
  useNodeInputRequestsStore.getState().requestAdd('', 'inputs', 'a');
  const view = render(<Area title="Source" enabled={false} />);
  expect(useNodeInputRequestsStore.getState().pendingRequests).toHaveLength(3);
  view.rerender(<Area title="Source" />);
  expect(screen.getByText('a')).toBeVisible();
  expect(useNodeInputRequestsStore.getState().pendingRequests).toHaveLength(2);
});
