import { create } from 'zustand';
import type { FrequencyRequest } from '@/features/project/api';

export interface FrequencyDisplay {
  display: 'cloud' | 'list';
  cloudLimit: number;
  listLimit: number | null;
  filter: string;
  comparisonSort: string;
  comparisonDescending: boolean;
  comparisonRows: number;
}
export const defaultFrequencyDisplay: FrequencyDisplay = {
  display: 'cloud',
  cloudLimit: 50,
  listLimit: null,
  filter: '',
  comparisonSort: 'log_likelihood_llv',
  comparisonDescending: true,
  comparisonRows: 50,
};
export interface FrequencyDraft {
  inputs: FrequencyRequest['inputs'];
  study: string | null;
}
interface FrequencyState {
  display: Record<string, FrequencyDisplay>;
  setDisplay: (base: string, id: string, patch: Partial<FrequencyDisplay>) => void;
  active: Record<string, string>;
  drafts: Record<string, FrequencyDraft>;
  activate: (base: string, id: string) => void;
  setDraft: (base: string, id: string, draft: FrequencyDraft) => void;
  remove: (base: string, id: string) => void;
  renameSource: (base: string, before: string, after: string) => void;
}
const draftKey = (base: string, id: string) => JSON.stringify([base, id]);
export const useFrequencyState = create<FrequencyState>((set) => ({
  display: {},
  setDisplay: (base, id, patch) => {
    set((state) => ({
      display: {
        ...state.display,
        [draftKey(base, id)]: {
          ...defaultFrequencyDisplay,
          ...state.display[draftKey(base, id)],
          ...patch,
        },
      },
    }));
  },
  active: {},
  drafts: {},
  activate: (base, id) => {
    set((state) => ({ active: { ...state.active, [base]: id } }));
  },
  setDraft: (base, id, draft) => {
    set((state) => ({ drafts: { ...state.drafts, [draftKey(base, id)]: draft } }));
  },
  remove: (base, id) => {
    set((state) => {
      const drafts = Object.fromEntries(
        Object.entries(state.drafts).filter(([key]) => key !== draftKey(base, id)),
      );
      const active = Object.fromEntries(
        Object.entries(state.active).filter(([key, selected]) => key !== base || selected !== id),
      );
      const display = Object.fromEntries(
        Object.entries(state.display).filter(([key]) => key !== draftKey(base, id)),
      );
      return { drafts, active, display };
    });
  },
  renameSource: (base, before, after) => {
    set((state) => ({
      drafts: Object.fromEntries(
        Object.entries(state.drafts).map(([key, draft]) => {
          if ((JSON.parse(key) as string[])[0] !== base) return [key, draft];
          return [
            key,
            {
              inputs: draft.inputs.map((input) =>
                input.source.schema === 'data' && input.source.name === before
                  ? { ...input, source: { ...input.source, name: after } }
                  : input,
              ),
              study: draft.study === before ? after : draft.study,
            },
          ];
        }),
      ),
    }));
  },
}));
export const getFrequencyDraft = (state: FrequencyState, base: string, id: string) =>
  state.drafts[draftKey(base, id)];
export function orderedFrequencyRequest(draft: FrequencyDraft): FrequencyRequest {
  const inputs = [...draft.inputs];
  const study = inputs.findIndex((input) => input.source.name === draft.study);
  if (inputs.length === 2 && study === 0) inputs.reverse();
  return { inputs };
}
