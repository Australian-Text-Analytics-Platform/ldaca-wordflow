import type { AnalysisRequestOfKind } from '../common/hooks/useAnalysisFeature';
import {
  DEFAULT_ANNOTATION_TAB_SETTINGS,
  defaultAnnotationConcurrency,
} from './annotationTabSettings';
import type { AnnotationProviderType } from './aiProviders';
import { DEFAULT_ANNOTATION_PROMPT } from './components/AnnotationPromptInput';

/**
 * Annotation's advanced settings, as a tab holds them: the Example Data Block
 * and its sampling, the prompt, the provider's inference settings, and the
 * Run controls. Provider and Model are never advanced, since they decide
 * where text is sent.
 */
export interface AnnotationAdvancedSettings {
  /** Whether a complete Example Data Block is chosen. */
  useExamples: boolean;
  aiPrompt: string;
  aiTemperature: number;
  aiMaxRetriesPerBatch: number;
  aiMaxExamplesPerClass: number;
  aiExampleSamplingMethod: (typeof DEFAULT_ANNOTATION_TAB_SETTINGS)['aiExampleSamplingMethod'];
  aiExampleRandomSeed: number;
  aiBatchSize: number;
  aiProcessingMode: (typeof DEFAULT_ANNOTATION_TAB_SETTINGS)['aiProcessingMode'];
  /** Requests at once for the selected provider, before a server cap. */
  aiMaxConcurrency: number;
  aiReasoningEnabled: boolean;
  aiReasoningEffort: string;
}

/**
 * The settings as Basic mode sends them: no examples, the default prompt, and
 * every inference and Run setting at its default. The draft is not changed.
 */
export function basicAnnotationSettings(
  provider: AnnotationProviderType | null,
): AnnotationAdvancedSettings {
  const defaults = DEFAULT_ANNOTATION_TAB_SETTINGS;
  return {
    useExamples: false,
    aiPrompt: defaults.aiPrompt,
    aiTemperature: defaults.aiTemperature,
    aiMaxRetriesPerBatch: defaults.aiMaxRetriesPerBatch,
    aiMaxExamplesPerClass: defaults.aiMaxExamplesPerClass,
    aiExampleSamplingMethod: defaults.aiExampleSamplingMethod,
    aiExampleRandomSeed: defaults.aiExampleRandomSeed,
    aiBatchSize: defaults.aiBatchSize,
    aiProcessingMode: defaults.aiProcessingMode,
    aiMaxConcurrency: defaultAnnotationConcurrency(provider),
    aiReasoningEnabled: defaults.aiReasoningEnabled,
    aiReasoningEffort: defaults.aiReasoningEffort,
  };
}

/**
 * Whether the tab's last Preview or Run used an advanced setting, so the tab
 * opens showing it.
 */
export function annotationRunUsedAdvanced(
  preview: AnalysisRequestOfKind<'annotation'> | null,
  runAll: AnalysisRequestOfKind<'annotation_run_all'> | null,
): boolean {
  const defaults = DEFAULT_ANNOTATION_TAB_SETTINGS;
  const sourceUsedAdvanced = (request: AnalysisRequestOfKind<'annotation'>) =>
    Boolean(request.example_node_id) ||
    request.instruction !== DEFAULT_ANNOTATION_PROMPT ||
    (request.temperature ?? defaults.aiTemperature) !== defaults.aiTemperature ||
    (request.max_retries_per_batch ?? defaults.aiMaxRetriesPerBatch) !==
      defaults.aiMaxRetriesPerBatch ||
    request.reasoning_enabled === true;
  if (preview && sourceUsedAdvanced(preview)) return true;
  if (!runAll) return false;
  return (
    sourceUsedAdvanced({ ...runAll.source, kind: 'annotation' }) ||
    (runAll.batch_size ?? defaults.aiBatchSize) !== defaults.aiBatchSize ||
    (runAll.processing_mode ?? defaults.aiProcessingMode) !== defaults.aiProcessingMode ||
    (runAll.max_concurrency != null &&
      runAll.max_concurrency !== defaultAnnotationConcurrency(runAll.source.provider))
  );
}
