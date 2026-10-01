import type { TopicRequest, TopicSampling } from '@/features/tools/topic-modeling/api';
import { create } from 'zustand';
import { analysisDraftKey, createAnalysisDraftStore } from '../common/analysisDraftStore';
import { renameInput, type Rename } from '../common/renameReferences';
export { analysisDraftKey as topicKey } from '../common/analysisDraftStore';
export const useTopicState = createAnalysisDraftStore<TopicRequest>(renameRequest);
export const useTopicSampling = create<{
  choices: Record<string, Record<string, TopicSampling>>;
  remove: (base: string, tab: string) => void;
  setChoices: (base: string, tab: string, choices: Record<string, TopicSampling>) => void;
}>((set) => ({
  choices: {},
  remove: (base, tab) => {
    set((state) => {
      const choices = Object.fromEntries(
        Object.entries(state.choices).filter(([key]) => key !== analysisDraftKey(base, tab)),
      );
      return { choices };
    });
  },
  setChoices: (base, tab, choices) => {
    set((state) => ({ choices: { ...state.choices, [analysisDraftKey(base, tab)]: choices } }));
  },
}));

function renameRequest(request: TopicRequest, rename: Rename): TopicRequest {
  return {
    ...request,
    inputs: request.inputs.map((input) => renameInput(input, rename, ['column'])),
  };
}
