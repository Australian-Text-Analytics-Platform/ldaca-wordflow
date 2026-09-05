import { describe, expect, it } from 'vitest';

import { isTabbedMainView, isWorkspaceRequired } from '../viewRegistry';

describe('view registry', () => {
  it('marks only Data Loader as available before a workspace loads', () => {
    expect(isWorkspaceRequired('data-loader')).toBe(false);
    expect(isWorkspaceRequired('filter')).toBe(true);
    expect(isWorkspaceRequired('export')).toBe(true);
  });

  it('marks analysis-style views as owners of their main card frame', () => {
    expect(isTabbedMainView('annotation')).toBe(true);
    expect(isTabbedMainView('quotation')).toBe(true);
    expect(isTabbedMainView('data-loader')).toBe(false);
  });
});
