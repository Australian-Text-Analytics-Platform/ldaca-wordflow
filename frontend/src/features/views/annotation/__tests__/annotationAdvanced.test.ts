import { describe, expect, it } from 'vitest';

import { annotationRunUsedAdvanced, basicAnnotationSettings } from '../annotationAdvanced';
import { DEFAULT_ANNOTATION_PROMPT } from '../components/AnnotationPromptInput';
import type { AnalysisRequestOfKind } from '../../common/hooks/useAnalysisFeature';

const preview: AnalysisRequestOfKind<'annotation'> = {
  kind: 'annotation',
  node_id: 'source',
  text_column: 'text',
  annotation_column: 'label',
  class_node_id: 'codebook',
  class_column: 'code',
  description_column: 'description',
  classes: [{ name: 'support', description: 'Supports' }],
  provider_configuration_id: 'provider-1',
  provider: 'custom',
  model: 'local',
  instruction: DEFAULT_ANNOTATION_PROMPT,
  temperature: 0,
  max_retries_per_batch: 2,
  reasoning_enabled: false,
};

describe('basicAnnotationSettings', () => {
  it('uses no examples, the default prompt, and each default, with the provider default concurrency', () => {
    expect(basicAnnotationSettings('custom')).toEqual({
      useExamples: false,
      aiPrompt: '',
      aiTemperature: 0,
      aiMaxRetriesPerBatch: 2,
      aiMaxExamplesPerClass: 10,
      aiExampleSamplingMethod: 'random',
      aiExampleRandomSeed: 0,
      aiBatchSize: 20,
      aiProcessingMode: 'fill_missing',
      aiMaxConcurrency: 2,
      aiReasoningEnabled: false,
      aiReasoningEffort: 'medium',
    });
    expect(basicAnnotationSettings('openai').aiMaxConcurrency).toBe(10);
  });
});

describe('annotationRunUsedAdvanced', () => {
  it('is false for a run with only Basic settings', () => {
    expect(annotationRunUsedAdvanced(preview, null)).toBe(false);
    expect(
      annotationRunUsedAdvanced(null, {
        kind: 'annotation_run_all',
        source: preview,
        batch_size: 20,
        processing_mode: 'fill_missing',
        max_concurrency: 2,
      }),
    ).toBe(false);
  });

  it('is true for examples, a prompt, inference or Run settings', () => {
    expect(annotationRunUsedAdvanced({ ...preview, example_node_id: 'examples' }, null)).toBe(true);
    expect(annotationRunUsedAdvanced({ ...preview, instruction: 'Be careful.' }, null)).toBe(true);
    expect(annotationRunUsedAdvanced({ ...preview, temperature: 0.4 }, null)).toBe(true);
    expect(annotationRunUsedAdvanced({ ...preview, reasoning_enabled: true }, null)).toBe(true);
    expect(
      annotationRunUsedAdvanced(null, {
        kind: 'annotation_run_all',
        source: preview,
        batch_size: 20,
        processing_mode: 'reprocess_all',
      }),
    ).toBe(true);
  });
});
