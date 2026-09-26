import type { ArrowField } from './arrowTable';
import { arrowExtensionName } from './arrowTable';

/** Exact semantic identity published by the backend in Arrow extension metadata. */
export const TOPIC_COVERAGE_EXTENSION = 'org.ldaca.wordflow.topic_coverage.v1';

/**
 * Detects the Topic Coverage extension without assigning it a second
 * frontend type name. Used by Data View and Filter because those features
 * provide behavior beyond generic Arrow value rendering.
 */
export const isTopicCoverageField = (field: ArrowField | undefined): boolean =>
  field !== undefined && arrowExtensionName(field) === TOPIC_COVERAGE_EXTENSION;

/**
 * Columns that analyses and most Data Block tools cannot use yet (issue 200).
 * Topic Coverage is the only one: pickers leave it out of metadata, groups,
 * keys, and text tools. The Data View and Filter still support it.
 */
export const isUnsupportedColumnField = (field: ArrowField | undefined): boolean =>
  isTopicCoverageField(field);

/** The inverse of {@link isUnsupportedColumnField}, for picker predicates. */
export const isSupportedColumnField = (field: ArrowField | undefined): boolean =>
  !isUnsupportedColumnField(field);
