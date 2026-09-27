/**
 * Lightweight tool id source of truth.
 *
 * Used by: UI state, settings, and URL routing because those layers need
 * stable tool ids without importing icon or feature-loader modules.
 */
export const ALL_TOOLS = [
  'data-loader',
  'filter',
  'token-frequency',
  'concordance',
  'plots',
  'topic-modeling',
  'quotation',
  'annotation',
  'export',
] as const;

export type ToolId = (typeof ALL_TOOLS)[number];
