import { beforeEach, expect, it } from 'vitest';
import { getFrequencyDraft, orderedFrequencyRequest, useFrequencyState } from './frequencyState';

const inputs = ['A', 'B'].map((name) => ({
  source: { schema: 'data', name },
  column: 'text',
  tokenizer: 'plain_words',
}));
beforeEach(() => useFrequencyState.setState({ active: {}, drafts: {} }));
it('orders captured reference and study inputs without changing the draft', () => {
  const draft = { inputs, study: 'A' };
  expect(orderedFrequencyRequest(draft).inputs.map((input) => input.source.name)).toEqual([
    'B',
    'A',
  ]);
  expect(draft.inputs.map((input) => input.source.name)).toEqual(['A', 'B']);
});
it('keeps project and tab drafts independent and reconciles source rename only in that project', () => {
  const state = useFrequencyState.getState();
  state.setDraft('one', 'tab', { inputs, study: 'A' });
  state.setDraft('two', 'tab', { inputs, study: 'A' });
  state.renameSource('one', 'A', 'Renamed');
  expect(getFrequencyDraft(useFrequencyState.getState(), 'one', 'tab')?.study).toBe('Renamed');
  expect(getFrequencyDraft(useFrequencyState.getState(), 'two', 'tab')?.study).toBe('A');
  state.activate('one', 'tab');
  state.remove('one', 'tab');
  expect(getFrequencyDraft(useFrequencyState.getState(), 'one', 'tab')).toBeUndefined();
  expect(useFrequencyState.getState().active.one).toBeUndefined();
  expect(getFrequencyDraft(useFrequencyState.getState(), 'two', 'tab')).toBeDefined();
});
