import { describe, expect, it } from 'vitest';
import { normaliseIso6391LanguageCode, partitionTokenizerModelsForLanguage } from '../languages';

describe('native catalogue recommendations', () => {
  const models = [
    { id: 'custom-multilingual', languages: ['en', 'ja'] },
    { id: 'plain', languages: ['en'] },
    { id: 'chinese', languages: ['zh'] },
  ];

  it('retains server order and arbitrary catalogue entries', () => {
    expect(partitionTokenizerModelsForLanguage(models, 'EN_us')).toEqual({
      recommended: models.slice(0, 2),
      other: models.slice(2),
    });
    expect(partitionTokenizerModelsForLanguage(models, null)).toEqual({
      recommended: [],
      other: models,
    });
    expect(normaliseIso6391LanguageCode('  ja-JP ')).toBe('ja');
    expect(normaliseIso6391LanguageCode('unknown')).toBeNull();
  });
});
