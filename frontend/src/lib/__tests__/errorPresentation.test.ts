import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/apiError';
import {
  UNEXPECTED_ERROR_MESSAGE,
  presentError,
  presentFailureMessage,
} from '@/lib/errorPresentation';

describe('errorPresentation (issue 205)', () => {
  it('keeps written messages as they are', () => {
    expect(presentFailureMessage('Choose a text column first.', 'x')).toEqual({
      message: 'Choose a text column first.',
      technical: null,
    });
  });

  it('turns a Python diagnostic into plain words, keeping it for Details', () => {
    expect(
      presentFailureMessage('ComputeError: cannot cast extension types to String', 'x'),
    ).toEqual({
      message: UNEXPECTED_ERROR_MESSAGE,
      technical: 'ComputeError: cannot cast extension types to String',
    });
    expect(presentFailureMessage('RuntimeError', 'x').technical).toBe('RuntimeError');
  });

  it('uses the fallback for empty or unknown values', () => {
    expect(presentFailureMessage('  ', 'Try again.').message).toBe('Try again.');
    expect(presentError({ weird: true }, 'Try again.')).toEqual({
      message: 'Try again.',
      technical: null,
    });
  });

  it('carries an ApiError technical text under Details', () => {
    const error = new ApiError(UNEXPECTED_ERROR_MESSAGE, {
      status: 500,
      technical: 'RuntimeError: boom\nReference: r-1',
    });
    expect(presentError(error, 'x')).toEqual({
      message: UNEXPECTED_ERROR_MESSAGE,
      technical: 'RuntimeError: boom\nReference: r-1',
    });
  });

  it('reads a stored failure with its diagnostic', () => {
    expect(
      presentError(
        {
          code: 'annotation_provider_authentication_failed',
          message: 'OpenAI rejected the API key. Check it in Settings.',
          diagnostic: 'AuthenticationError: Error code: 401',
        },
        'x',
      ),
    ).toEqual({
      message: 'OpenAI rejected the API key. Check it in Settings.',
      technical: 'AuthenticationError: Error code: 401',
    });
  });
});
