import { create } from 'zustand';
import type { NodeInput } from '@/features/tools/common/nodeInputs/nodeInputsCore';

export type JoinRole = 'left' | 'right';
export type JoinInputs = Record<JoinRole, NodeInput | null>;

/** Each webview has its own store. Names are the project's actual table names. */
export const usePreprocessingInputs = create<{
  activeTool: string;
  activate: (tool: string) => void;
  byTool: Record<string, NodeInput[]>;
  join: JoinInputs;
  setJoin: (role: JoinRole, input: NodeInput | null) => void;
  set: (tool: string, inputs: NodeInput[]) => void;
  rename: (previous: string, next: string) => void;
  retain: (names: Set<string>) => void;
}>((set) => ({
  activeTool: 'filter',
  activate: (activeTool) => {
    set({ activeTool });
  },
  byTool: {},
  join: { left: null, right: null },
  setJoin: (role, input) => {
    set((state) => ({ join: { ...state.join, [role]: input } }));
  },
  set: (tool, inputs) => {
    set((state) => ({ byTool: { ...state.byTool, [tool]: inputs } }));
  },
  rename: (previous, next) => {
    set((state) => ({
      join: {
        left:
          state.join.left?.node_id === previous
            ? { ...state.join.left, node_id: next }
            : state.join.left,
        right:
          state.join.right?.node_id === previous
            ? { ...state.join.right, node_id: next }
            : state.join.right,
      },
      byTool: Object.fromEntries(
        Object.entries(state.byTool).map(([tool, inputs]) => [
          tool,
          inputs.map((input) => (input.node_id === previous ? { ...input, node_id: next } : input)),
        ]),
      ),
    }));
  },
  retain: (names) => {
    set((state) => ({
      join: {
        left: state.join.left && names.has(state.join.left.node_id) ? state.join.left : null,
        right: state.join.right && names.has(state.join.right.node_id) ? state.join.right : null,
      },
      byTool: Object.fromEntries(
        Object.entries(state.byTool).map(([tool, inputs]) => [
          tool,
          inputs.filter((input) => names.has(input.node_id)),
        ]),
      ),
    }));
  },
}));
