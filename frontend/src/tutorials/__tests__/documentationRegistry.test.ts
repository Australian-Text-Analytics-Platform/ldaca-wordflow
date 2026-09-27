import { expect, it } from 'vitest';
import { BUNDLED_REGISTRY } from '../bundledRegistry';
import { getDocumentTarget } from '../documentationRegistry';

it('resolves bundled entries directly into the common document contract', () => {
  for (const kind of ['tutorial', 'info', 'reference'] as const) {
    for (const [key, target] of Object.entries(BUNDLED_REGISTRY[kind])) {
      expect(getDocumentTarget(kind, key)).toEqual({ kind, key, ...target });
    }
  }
  expect(getDocumentTarget('reference', 'missing')).toBeNull();
});
