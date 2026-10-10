import { describe, expect, it } from 'vitest';

import { topicGroupKey, topicNameDisplay, topicNameProblem, withTopicName } from '../topicNames';

const topic = (id: number, leaves: number[] | null) => ({ id, leaves });

describe('Topic names (trial)', () => {
  it('keys a name by the natural Topics a Topic holds, not by its number', () => {
    expect(topicGroupKey(topic(4, [3, 7, 12]))).toBe('3,7,12');
    expect(topicGroupKey(topic(-1, [0]))).toBeNull();
    expect(topicGroupKey(topic(2, null))).toBeNull();
  });

  it('shows a group its own name, and hints for merged or split groups', () => {
    const names = { '3': 'Sleep', '7': 'Diet', '1,2': 'Sport' };
    expect(topicNameDisplay(topic(0, [3]), names)).toEqual({ name: 'Sleep', hint: null });
    // Merged: the names inside it.
    expect(topicNameDisplay(topic(0, [3, 7, 9]), names)).toEqual({
      name: null,
      hint: 'includes Sleep, Diet',
    });
    // Split: the name of the group it was part of.
    expect(topicNameDisplay(topic(5, [2]), names)).toEqual({ name: null, hint: 'part of Sport' });
    expect(topicNameDisplay(topic(6, [8]), names)).toEqual({ name: null, hint: null });
  });

  it('sets, replaces and removes names, and refuses names the app uses', () => {
    const named = withTopicName({}, '3', '  Sleep ');
    expect(named).toEqual({ '3': 'Sleep' });
    expect(withTopicName(named, '3', 'Rest')).toEqual({ '3': 'Rest' });
    expect(withTopicName(named, '3', '')).toEqual({});
    expect(topicNameProblem('Topic 4')).not.toBeNull();
    expect(topicNameProblem('Ungrouped')).not.toBeNull();
    expect(topicNameProblem('x'.repeat(121))).not.toBeNull();
    expect(topicNameProblem('Sleep and health')).toBeNull();
  });
});
