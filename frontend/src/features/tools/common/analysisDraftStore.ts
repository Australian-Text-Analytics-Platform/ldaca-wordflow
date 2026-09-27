import { create } from 'zustand';
import { renamedDrafts, type Rename } from './renameReferences';
export const analysisDraftKey = (base: string, id: string) => JSON.stringify([base, id]);
interface State<Request> {
  reconcile: (base: string, rename: Rename) => void;
  active: Record<string, string>;
  drafts: Record<string, Request>;
  previews: Record<string, { request: Request; generation: number }>;
  discardPreview: (base: string, id: string) => void;
  activate: (base: string, id: string) => void;
  setDraft: (base: string, id: string, draft: Request) => void;
  handoff: (base: string, id: string, draft: Request) => void;
  remove: (base: string, id: string) => void;
}
export const createAnalysisDraftStore = <Request>() =>
  create<State<Request>>((set) => ({
    reconcile: (base, rename) => {
      set((state) => ({ drafts: renamedDrafts(state.drafts, base, rename) }));
    },
    active: {},
    drafts: {},
    previews: {},
    discardPreview: (base, id) => {
      set((state) => ({
        previews: Object.fromEntries(
          Object.entries(state.previews).filter(([key]) => key !== analysisDraftKey(base, id)),
        ),
      }));
    },
    activate: (base, id) => {
      set((state) => ({ active: { ...state.active, [base]: id } }));
    },
    setDraft: (base, id, draft) => {
      set((state) => ({ drafts: { ...state.drafts, [analysisDraftKey(base, id)]: draft } }));
    },
    handoff: (base, id, draft) => {
      set((state) => ({
        active: { ...state.active, [base]: id },
        drafts: { ...state.drafts, [analysisDraftKey(base, id)]: draft },
        previews: {
          ...state.previews,
          [analysisDraftKey(base, id)]: {
            request: draft,
            generation: (state.previews[analysisDraftKey(base, id)]?.generation ?? 0) + 1,
          },
        },
      }));
    },
    remove: (base, id) => {
      set((state) => ({
        drafts: Object.fromEntries(
          Object.entries(state.drafts).filter(([key]) => key !== analysisDraftKey(base, id)),
        ),
        active: Object.fromEntries(
          Object.entries(state.active).filter(([key, value]) => key !== base || value !== id),
        ),
        previews: Object.fromEntries(
          Object.entries(state.previews).filter(([key]) => key !== analysisDraftKey(base, id)),
        ),
      }));
    },
  }));
