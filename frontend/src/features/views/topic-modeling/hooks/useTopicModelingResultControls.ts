import { useReducer } from 'react';

import { topicSearchTerms } from '../topicModelingAdapters';
import { assignSearchTermSlots } from '../topicSearch';

interface TopicModelingResultControlState {
  selectedTopicIds: Set<number>;
  /** The search box's text: highlighting follows it at once. */
  topicSearchQuery: string;
  /** The search last applied with Apply or Enter: filtering follows it. */
  appliedTopicSearchQuery: string;
  /** Each term's colour slot, kept until the term is removed. */
  topicSearchTermSlots: ReadonlyMap<string, number>;
}

export type TopicModelingResultControlAction =
  | { type: 'topicSelectionToggled'; id: number }
  | { type: 'topicSelectionCleared' }
  | { type: 'topicSearchChanged'; query: string }
  | { type: 'topicSearchApplied' };

/**
 * Creates reducer-owned state for topic-modeling result controls.
 * Used by: useTopicModelingResultControls hook.
 * Why: selection and search are result-view interactions that reset together.
 */
export const createTopicModelingResultControlState = (): TopicModelingResultControlState => ({
  selectedTopicIds: new Set(),
  topicSearchQuery: '',
  appliedTopicSearchQuery: '',
  topicSearchTermSlots: new Map(),
});

/**
 * Reduces local result-view interactions for topic modeling.
 * Used by: useTopicModelingResultControls and tests.
 * Flow: topic clicks toggle the selected set and search changes remain
 * independent of backend task lifecycle.
 */
export const topicModelingResultControlReducer = (
  state: TopicModelingResultControlState,
  action: TopicModelingResultControlAction,
): TopicModelingResultControlState => {
  switch (action.type) {
    case 'topicSelectionToggled': {
      const selectedTopicIds = new Set(state.selectedTopicIds);
      if (selectedTopicIds.has(action.id)) selectedTopicIds.delete(action.id);
      else selectedTopicIds.add(action.id);
      return { ...state, selectedTopicIds };
    }
    case 'topicSelectionCleared':
      return state.selectedTopicIds.size === 0 ? state : { ...state, selectedTopicIds: new Set() };
    case 'topicSearchChanged': {
      if (state.topicSearchQuery === action.query) return state;
      return {
        ...state,
        topicSearchQuery: action.query,
        // An empty box clears the filter at once; anything else waits for
        // Apply or Enter (Chao, 15 Nov 2026).
        appliedTopicSearchQuery: action.query.trim() === '' ? '' : state.appliedTopicSearchQuery,
        topicSearchTermSlots: assignSearchTermSlots(
          topicSearchTerms(state.topicSearchQuery),
          state.topicSearchTermSlots,
          topicSearchTerms(action.query),
        ),
      };
    }
    case 'topicSearchApplied':
      return state.appliedTopicSearchQuery === state.topicSearchQuery
        ? state
        : { ...state, appliedTopicSearchQuery: state.topicSearchQuery };
    default:
      return state;
  }
};

/**
 * Owns topic-modeling result-panel interaction state.
 * Used by: TopicModelingFeature.
 * Flow: expose named topic selection and search actions for the results panel.
 */
export const useTopicModelingResultControls = () => {
  const [state, dispatch] = useReducer(
    topicModelingResultControlReducer,
    undefined,
    createTopicModelingResultControlState,
  );

  const handleToggleTopicSelection = (id: number) => {
    dispatch({ type: 'topicSelectionToggled', id });
  };

  const handleClearTopicSelection = () => {
    dispatch({ type: 'topicSelectionCleared' });
  };

  const setTopicSearchQuery = (query: string) => {
    dispatch({ type: 'topicSearchChanged', query });
  };

  const applyTopicSearch = () => {
    dispatch({ type: 'topicSearchApplied' });
  };

  return {
    ...state,
    handleToggleTopicSelection,
    handleClearTopicSelection,
    setTopicSearchQuery,
    applyTopicSearch,
  };
};
