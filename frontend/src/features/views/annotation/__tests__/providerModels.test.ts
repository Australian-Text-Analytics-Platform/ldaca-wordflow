import { describe, expect, it } from 'vitest';

import { layerProviderModels } from '../providerModels';

describe('the model each provider starts with in an Annotation tab', () => {
  const server = { research: 'qwen3-32b' };

  it('prefers the tab, then the Project, then the person, then the server', () => {
    expect(layerProviderModels(server, {}, {}, {})).toEqual({ research: 'qwen3-32b' });
    expect(layerProviderModels(server, { research: 'llama-4' }, {}, {})).toEqual({
      research: 'llama-4',
    });
    expect(
      layerProviderModels(server, { research: 'llama-4' }, { research: 'gpt-oss-120b' }, {}),
    ).toEqual({ research: 'gpt-oss-120b' });
    expect(
      layerProviderModels(
        server,
        { research: 'llama-4' },
        { research: 'gpt-oss-120b' },
        { research: 'mistral' },
      ),
    ).toEqual({ research: 'mistral' });
  });

  it('skips empty names and missing layers', () => {
    expect(
      layerProviderModels(
        server,
        undefined,
        { research: '  ', openai: ' gpt-5 ' },
        { research: '' },
      ),
    ).toEqual({ research: 'qwen3-32b', openai: 'gpt-5' });
  });
});
