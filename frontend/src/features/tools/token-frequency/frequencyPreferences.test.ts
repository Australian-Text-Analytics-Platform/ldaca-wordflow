import { expect, it } from 'vitest';
import type { FrequencyAnalysisResult } from '@/features/project/api';
import { corpusColor, corpusColorKey, frequencySettings } from './frequencySettings';

const corpora = ['Reference', 'Study'].map((name) => ({
  source: { schema: 'data', name },
})) as FrequencyAnalysisResult['result']['payload']['corpora'];

it('keeps saved positional colours attached to sources when corpus roles change', () => {
  const saved = frequencySettings({ colors: ['#ff0000', '#0000ff'] }, corpora);
  const reopened = frequencySettings({ ...saved }, [...corpora].reverse());
  expect(corpusColor(reopened, corpora[0].source, null, 1)).toBe('#ff0000');
  expect(corpusColor(reopened, corpora[1].source, null, 0)).toBe('#0000ff');
  expect(reopened).not.toHaveProperty('comparisonSort');
});

it('distinguishes same-name sources in separate schemas without changing stored settings', () => {
  const source = { schema: 'archive', name: 'Reference' };
  const settings = { colors: { [corpusColorKey(source)]: '#123456' } };
  const restored = frequencySettings(settings);
  expect(corpusColor(restored, source, null, 0)).toBe('#123456');
  expect(corpusColor(restored, corpora[0].source, '#abcdef', 0)).toBe('#abcdef');
  expect(settings.colors).toEqual({ [corpusColorKey(source)]: '#123456' });
});
