/** The run's Topic names, shared by the list, bubbles and examples. */
import { createContext, useContext } from 'react';

import type { TopicNames } from '../../topicNames';

interface TopicNamesValue {
  names: TopicNames;
  /** Saves a name for a group key; an empty name removes it. Null when names cannot be saved. */
  rename: ((key: string, name: string) => Promise<void>) | null;
}

export const TopicNamesContext = createContext<TopicNamesValue>({ names: {}, rename: null });

export const useTopicNames = () => useContext(TopicNamesContext);
