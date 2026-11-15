import { describe, expect, it } from 'vitest';

import { tooLongRowsNote } from '../tooLongRowsNote';

describe('tooLongRowsNote', () => {
  it('says nothing when no row was too long', () => {
    expect(tooLongRowsNote(undefined, 'some-model', undefined)).toBe('');
    expect(tooLongRowsNote(0, 'some-model', 262144)).toBe('');
  });

  it('names the model and its context window, and says what to do', () => {
    expect(tooLongRowsNote(3, 'qwen3.8-27b', 262144)).toBe(
      ' 3 failed rows have texts too long for qwen3.8-27b, whose context window is 262,144 tokens. Choose a model that takes longer texts, use fewer examples, or annotate shorter texts.',
    );
  });

  it('leaves the window out when the provider did not give it', () => {
    expect(tooLongRowsNote(1, 'some-model', null)).toBe(
      ' 1 failed row has a text too long for some-model. Choose a model that takes longer texts, use fewer examples, or annotate shorter texts.',
    );
  });
});
