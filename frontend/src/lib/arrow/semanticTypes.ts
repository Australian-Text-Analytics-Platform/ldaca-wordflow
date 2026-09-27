import type { ArrowField } from './decodeArrowTable';
import { arrowExtensionName } from './decodeArrowTable';

/** Exact semantic identity published by the backend in Arrow extension metadata. */
export const TOPIC_COVERAGE_EXTENSION = 'org.ldaca.wordflow.topic_coverage.v1';

/**
 * Detects the Topic Coverage extension without assigning it a second
 * frontend type name. Used by Data View and Filter because those features
 * provide behavior beyond generic Arrow value rendering.
 */
export const isTopicCoverageField = (field: ArrowField | undefined): boolean =>
  field !== undefined && arrowExtensionName(field) === TOPIC_COVERAGE_EXTENSION;
