import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/**
 * Ephemeral bridge from graph double-clicks and graph/sidebar add buttons to the active tool's
 * add-node-as-needed input panel.
 *
 * The React Flow graph is mounted outside individual analysis panels, so a
 * node's side "+" button cannot directly call the active tab's
 * ``useNodeInputs.addNodes``. Instead it holds a transient LIFO stack scoped by
 * connection scope + active tool. A single-selector owner consumes matching requests
 * immediately; multi-selector tools expose the stack through each visible
 * ``NodeInputsPanel`` and consume the latest carried Data Block on placement.
 *
 * This store is intentionally not persisted: button clicks are transient UI
 * intents, not canonical selection state.
 */
export interface NodeInputPointerPosition {
  x: number;
  y: number;
}

interface NodeInputAddRequest {
  id: number;
  scopeId: string;
  tool: string;
  nodeId: string;
  pointer?: NodeInputPointerPosition;
}

interface NodeInputRequestsState {
  nextId: number;
  pendingRequests: NodeInputAddRequest[];
}

interface NodeInputRequestsActions {
  requestAdd: (
    scopeId: string | null | undefined,
    tool: string | null | undefined,
    nodeId: string,
    pointer?: NodeInputPointerPosition,
  ) => void;
  consume: (id: number) => void;
  clear: () => void;
  prune: (scopeId: string, nodeIds: readonly string[]) => void;
  rename: (scopeId: string, previous: string, next: string) => void;
}

export type NodeInputRequestsStore = NodeInputRequestsState & NodeInputRequestsActions;

export const useNodeInputRequestsStore = create<NodeInputRequestsStore>()(
  devtools(
    immer((set) => ({
      nextId: 1,
      pendingRequests: [],

      /** Pushes a graph/sidebar add intent onto the carried LIFO stack. */
      requestAdd: (scopeId, tool, nodeId, pointer) => {
        set((state) => {
          if (scopeId == null || !tool || !nodeId) return;
          state.pendingRequests.push({
            id: state.nextId,
            scopeId,
            tool,
            nodeId,
            ...(pointer ? { pointer } : {}),
          });
          state.nextId += 1;
        });
      },

      /** Removes one request after placement or an explicit top-item discard. */
      consume: (id) => {
        set((state) => {
          state.pendingRequests = state.pendingRequests.filter((request) => request.id !== id);
        });
      },

      /** Discards the complete carried stack. */
      clear: () => {
        set((state) => {
          state.pendingRequests = [];
        });
      },

      /** Drops transient add intents whose authoritative target disappeared. */
      prune: (scopeId, nodeIds) => {
        set((state) => {
          const valid = new Set(nodeIds);
          state.pendingRequests = state.pendingRequests.filter(
            (request) => request.scopeId !== scopeId || valid.has(request.nodeId),
          );
        });
      },
      rename: (scopeId, previous, next) => {
        set((state) => {
          for (const request of state.pendingRequests)
            if (request.scopeId === scopeId && request.nodeId === previous) request.nodeId = next;
        });
      },
    })),
    { name: 'node-input-requests-store' },
  ),
);
