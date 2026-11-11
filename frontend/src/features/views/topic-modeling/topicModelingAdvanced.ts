import type { AnalysisRequestOfKind } from '../common/hooks/useAnalysisFeature';

/**
 * Whether a Topic Modelling run used one of its advanced settings (Passages,
 * Max tokens, the seed, Topic sampling), so a tab with no mode of its own
 * opens in Advanced. Sampling per Data Block is a Basic setting. A Max tokens
 * of 256 counts as Basic: runs saved before Auto always recorded one, mostly
 * the old default.
 */
export function topicRunUsedAdvanced(
  request: AnalysisRequestOfKind<'topic_modeling'> | null,
): boolean {
  if (!request) return false;
  return (
    (request.segmentation_method ?? 'automatic') !== 'automatic' ||
    (request.max_segment_tokens != null && request.max_segment_tokens !== 256) ||
    (request.random_seed ?? 0) !== 0 ||
    request.cluster_sample_size != null
  );
}
