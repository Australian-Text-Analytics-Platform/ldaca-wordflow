import { create } from 'zustand';
import type { TopicRequest, TopicSampling } from '@/features/project/api';
import { createAnalysisDraftStore, analysisDraftKey } from '../common/analysisDraftStore';
export { analysisDraftKey as topicKey } from '../common/analysisDraftStore';
export const useTopicState = createAnalysisDraftStore<TopicRequest>();
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
