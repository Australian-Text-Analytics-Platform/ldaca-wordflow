import { expect, it } from 'vitest';
import { usePreprocessingInputs } from './inputState';
it('keeps self-join roles independent and reconciles both on rename and deletion', () => {
  const state = usePreprocessingInputs.getState();
  state.setJoin('left', { node_id: 'source', column: 'id' });
  state.setJoin('right', { node_id: 'source', column: 'parent_id' });
  state.rename('source', 'renamed');
  expect(usePreprocessingInputs.getState().join).toEqual({
    left: { node_id: 'renamed', column: 'id' },
    right: { node_id: 'renamed', column: 'parent_id' },
  });
  state.setJoin('left', { node_id: 'other', column: 'key' });
  state.retain(new Set(['renamed']));
  expect(usePreprocessingInputs.getState().join).toEqual({
    left: null,
    right: { node_id: 'renamed', column: 'parent_id' },
  });
  state.retain(new Set());
  expect(usePreprocessingInputs.getState().join).toEqual({ left: null, right: null });
});
