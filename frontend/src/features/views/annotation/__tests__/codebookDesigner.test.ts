import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  draft: vi.fn(),
}));

vi.mock('@/features/provider-credentials/providerCredentialRequests', () => ({
  draftCodebookWithProviderCredential: mocks.draft,
}));

import {
  briefLength,
  codebookSignature,
  DEFAULT_CODEBOOK_DESIGNER_PROMPT,
  countWords,
  DEFAULT_SCALE_DESIGNER_PROMPT,
  describeDesignerConnectionError,
  parseCodeDesignerSettings,
  runCodebookDesigner,
} from '../codebookDesigner';

const request = {
  provider_configuration_id: 'provider-1',
  provider: 'openai' as const,
  model: 'gpt-test',
  text_column: 'text',
  brief: 'How candidates talk about jobs.',
  system_prompt: 'Design.',
};

const streamOf = (events: unknown[]) => ({
  stream: (async function* () {
    for (const event of events) yield event;
  })(),
});

describe('code designer settings', () => {
  it('starts from the agreed defaults and keeps values in range', () => {
    expect(parseCodeDesignerSettings(undefined)).toMatchObject({
      brief: '',
      maxClasses: 3,
      briefStale: false,
      sampleSize: 100,
      sampleSeed: 0,
      effort: 'high',
      systemPrompt: '',
    });
    expect(
      parseCodeDesignerSettings(
        JSON.stringify({ maxClasses: 40, sampleSize: 5, effort: 'xhigh', briefStale: true }),
      ),
    ).toMatchObject({ maxClasses: 10, sampleSize: 20, effort: 'high', briefStale: true });
    expect(parseCodeDesignerSettings('not json').maxClasses).toBe(3);
  });

  it('counts words and tells codebooks apart by their codes', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(countWords('   ')).toBe(0);
    const rows = [
      { class: 'Promise', description: 'Jobs created.' },
      { class: ' ', description: '' },
    ];
    expect(codebookSignature(rows)).toBe(
      codebookSignature([{ class: ' Promise ', description: 'Jobs created. ' }]),
    );
    expect(codebookSignature(rows)).not.toBe(
      codebookSignature([{ class: 'Promise', description: 'Jobs created or kept.' }]),
    );
  });

  it('describes a refused or lost request in plain words', () => {
    expect(describeDesignerConnectionError(new Error('SSE failed: 422 Unprocessable'))).toContain(
      'refused the settings',
    );
    expect(describeDesignerConnectionError(new TypeError('Load failed'))).toContain(
      'connection to Wordflow was lost',
    );
  });
});

describe('runCodebookDesigner', () => {
  it('reports each stage and returns the draft', async () => {
    mocks.draft.mockResolvedValue(
      streamOf([
        { type: 'stage', stage: 'sampling' },
        { type: 'stage', stage: 'waiting', sampled: 100, available: 226 },
        { type: 'stage', stage: 'reading' },
        {
          type: 'draft',
          codes: [
            { name: 'Promise', definition: 'Jobs created.' },
            { name: 'Other', definition: 'Anything else.' },
          ],
          sampled: 100,
          model: 'gpt-test',
        },
      ]),
    );
    const onStage = vi.fn();

    const outcome = await runCodebookDesigner({
      workspaceId: 'ws',
      nodeId: 'node',
      request,
      signal: new AbortController().signal,
      onStage,
    });

    expect(onStage.mock.calls).toEqual([
      ['sampling', undefined],
      ['waiting', 100],
      ['reading', undefined],
    ]);
    expect(outcome).toEqual({
      kind: 'draft',
      codes: [
        { name: 'Promise', definition: 'Jobs created.', outsideScale: false },
        { name: 'Other', definition: 'Anything else.', outsideScale: false },
      ],
      sampled: 100,
    });
  });

  it('passes on the server error, and treats a stream with no ending as a lost connection', async () => {
    mocks.draft.mockResolvedValueOnce(
      streamOf([{ type: 'error', message: 'OpenAI rejected the API key.', detail: 'raw' }]),
    );
    const failed = await runCodebookDesigner({
      workspaceId: 'ws',
      nodeId: 'node',
      request,
      signal: new AbortController().signal,
      onStage: vi.fn(),
    });
    expect(failed).toEqual({
      kind: 'error',
      message: 'OpenAI rejected the API key.',
      detail: 'raw',
    });

    mocks.draft.mockResolvedValueOnce(streamOf([{ type: 'stage', stage: 'waiting', sampled: 20 }]));
    const lost = await runCodebookDesigner({
      workspaceId: 'ws',
      nodeId: 'node',
      request,
      signal: new AbortController().signal,
      onStage: vi.fn(),
    });
    expect(lost.kind).toBe('error');
    expect(lost.kind === 'error' ? lost.message : '').toContain('connection to Wordflow was lost');
  });

  it('reports a stopped request as stopped, and sends one attempt only', async () => {
    const controller = new AbortController();
    mocks.draft.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(streamOf([]));
    });

    const outcome = await runCodebookDesigner({
      workspaceId: 'ws',
      nodeId: 'node',
      request,
      signal: controller.signal,
      onStage: vi.fn(),
    });

    expect(outcome).toEqual({ kind: 'stopped' });
    expect(mocks.draft).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: 'ws', nodeId: 'node', request }),
    );
  });
});

describe('DEFAULT_SCALE_DESIGNER_PROMPT', () => {
  it('anchors levels in one text and covers the whole range, not just the sample', () => {
    // Batch-relative levels are the scale's main risk (Chao, 16 and 17 Nov 2026).
    expect(DEFAULT_SCALE_DESIGNER_PROMPT).toContain(
      'Anchor every level in what can be seen in a single text',
    );
    expect(DEFAULT_SCALE_DESIGNER_PROMPT).toContain(
      'cover the whole range the brief implies, including ends the sample may not show',
    );
    expect(DEFAULT_SCALE_DESIGNER_PROMPT).toContain(
      "never set a level by how the sample's texts rank against each other",
    );
    expect(DEFAULT_SCALE_DESIGNER_PROMPT).toContain(
      'not because the sample lacks an end of the scale',
    );
    expect(DEFAULT_SCALE_DESIGNER_PROMPT).not.toContain('Use fewer if the sample does not support');
  });
});

describe('any language (Chao, 17 Nov 2026)', () => {
  it('counts a Chinese or Japanese brief in characters, others in words', () => {
    expect(briefLength('How candidates talk about jobs')).toEqual({
      count: 5,
      limit: 250,
      unit: 'words',
    });
    // Chao's brief: one "word" when split on spaces.
    const chinese =
      '我想要根据报导的侧重面进行分类，大致的想法是民生，经济，科技，政策，外交方向。';
    expect(briefLength(chinese)).toEqual({ count: chinese.length, limit: 500, unit: 'characters' });
    expect(briefLength('東京の 新聞記事 を 分類したい').unit).toBe('characters');
    // Korean puts spaces between words.
    expect(briefLength('후보자들이 일자리에 대해 말하는 방식').unit).toBe('words');
    expect(briefLength('').count).toBe(0);
  });

  it('asks for names in the language of the brief, with lengths for Chinese and Japanese', () => {
    for (const prompt of [DEFAULT_CODEBOOK_DESIGNER_PROMPT, DEFAULT_SCALE_DESIGNER_PROMPT]) {
      expect(prompt).toContain('named in the language of the brief');
      expect(prompt).toContain('in Chinese or Japanese, up to about six characters');
      expect(prompt).toContain('in Chinese or Japanese, under about 120 characters');
      expect(prompt).not.toContain('named exactly');
    }
  });
});
