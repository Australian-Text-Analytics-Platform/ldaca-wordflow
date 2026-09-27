import { expect, it } from 'vitest';
import { ALL_TOOLS } from '../toolIds';
import { TOOL_DEFINITIONS } from '../toolRegistry';
it('keeps every sidebar tool in declared order with a label and icon', () => {
  expect(TOOL_DEFINITIONS.map(({ id }) => id)).toEqual(ALL_TOOLS);
  for (const tool of TOOL_DEFINITIONS) {
    expect(tool.label).not.toBe('');
    expect(tool.icon).toBeDefined();
  }
});
