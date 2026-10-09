import type { FrequencyRequest } from '@/features/tools/token-frequency/api';
import { create } from 'zustand';
import { renameInput, renamedDrafts, type Rename } from '../common/renameReferences';

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
  reconcile: (base: string, rename: Rename) => void;
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
  reconcile: (base, rename) => {
    set((state) => ({ drafts: renamedDrafts(state.drafts, base, rename, renameFrequencyDraft) }));
  },
}));
export const getFrequencyDraft = (state: FrequencyState, base: string, id: string) =>
  state.drafts[draftKey(base, id)];
export function orderedFrequencyRequest(draft: FrequencyDraft): FrequencyRequest {
  const inputs = [...draft.inputs];
  const study = draft.study ? inputs.findIndex((input) => input.source.name === draft.study) : 0;
  if (inputs.length === 2 && study === 0) inputs.reverse();
  return { inputs };
}

function renameFrequencyDraft(draft: FrequencyDraft, rename: Rename): FrequencyDraft {
  return {
    ...draft,
    inputs: draft.inputs.map((input) => renameInput(input, rename, ['column'])),
    study:
      rename.type === 'table' &&
      rename.source.schema === 'data' &&
      draft.study?.toLowerCase() === rename.source.name.toLowerCase()
        ? rename.name
        : draft.study,
  };
}
