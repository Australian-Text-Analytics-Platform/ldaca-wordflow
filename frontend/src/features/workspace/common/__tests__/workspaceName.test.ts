import { describe, expect, it } from 'vitest';

import { getInvalidWorkspaceNameMessage } from '../workspaceName';

describe('getInvalidWorkspaceNameMessage', () => {
  it('recognises the backend invalid-name message, old and new wording', () => {
    expect(getInvalidWorkspaceNameMessage(new Error('Invalid project name: too long'))).toBe(
      'Invalid project name: too long',
    );
    expect(
      getInvalidWorkspaceNameMessage({ detail: { message: 'Invalid workspace name: x' } }),
    ).toBe('Invalid workspace name: x');
    expect(getInvalidWorkspaceNameMessage(new Error('Project not found'))).toBeNull();
  });
});
