import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { NodeInput } from '../nodeInputsCore';
import { useNodeInputs } from '../useNodeInputs';
import { projectWorkspaceNodeMetadata } from '@/features/workspace/common/workspaceNodeMetadata';
import { isArrowStringField } from '@/lib/arrow/arrowTable';

describe('useNodeInputs', () => {
  it('lets a one-block tool take a new Data Block after its input was deleted (issue 320)', () => {
    const live = projectWorkspaceNodeMetadata({ id: 'node-live', name: 'Live' });
    const { result } = renderHook(() => {
      const [value, setValue] = useState<NodeInput[]>([
        { node_id: 'node-deleted', column: 'text' },
      ]);
      return {
        value,
        inputs: useNodeInputs({
          value,
          onChange: setValue,
          allNodes: [live],
          constraints: { fieldPredicate: isArrowStringField, maxNodes: 1 },
        }),
      };
    });

    expect(result.current.inputs.canAddMore).toBe(true);
    act(() => {
      expect(result.current.inputs.addNodes(['node-live'])).toEqual([]);
    });
    expect(result.current.value.map((input) => input.node_id)).toEqual(['node-live']);
  });

  it.each([
    { maxNodes: 2, initialCount: 1 },
    { maxNodes: 6, initialCount: 5 },
  ])(
    'accepts through node $maxNodes, rejects the next node, and allows remove/re-add',
    ({ maxNodes, initialCount }) => {
      const allNodes = Array.from({ length: maxNodes + 1 }, (_, index) =>
        projectWorkspaceNodeMetadata({
          id: `node-${String(index + 1)}`,
          name: `Node ${String(index + 1)}`,
        }),
      );
      const initialValue: NodeInput[] = allNodes
        .slice(0, initialCount)
        .map((node) => ({ node_id: node.id, column: 'text' }));

      const { result } = renderHook(() => {
        const [value, setValue] = useState<NodeInput[]>(initialValue);
        return useNodeInputs({
          value,
          onChange: setValue,
          allNodes,
          constraints: { fieldPredicate: isArrowStringField, maxNodes },
        });
      });

      const lastAcceptedId = `node-${String(maxNodes)}`;
      const rejectedId = `node-${String(maxNodes + 1)}`;

      act(() => {
        expect(result.current.addNodes([lastAcceptedId])).toEqual([]);
      });
      expect(result.current.inputs).toHaveLength(maxNodes);

      let rejections: ReturnType<typeof result.current.addNodes> = [];
      act(() => {
        rejections = result.current.addNodes([rejectedId]);
      });
      expect(rejections).toEqual([
        { nodeId: rejectedId, reason: `This tool takes at most ${String(maxNodes)} Data Blocks.` },
      ]);

      act(() => {
        result.current.removeNode(lastAcceptedId);
      });
      expect(result.current.canAddMore).toBe(true);

      act(() => {
        expect(result.current.addNodes([rejectedId])).toEqual([]);
      });
      expect(result.current.inputs.map((input) => input.node_id)).toContain(rejectedId);
      expect(result.current.inputs).toHaveLength(maxNodes);
    },
  );
});
