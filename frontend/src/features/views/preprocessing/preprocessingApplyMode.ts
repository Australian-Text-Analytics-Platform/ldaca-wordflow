/**
 * Preprocessing tools (Filter, Sample, Join, Stack) always create a derived
 * Data Block, because Data Block Edits never change the number or order of
 * rows. Column tools that edit a block in place live in the Data Editor
 * (issue 143). `update` remains for the shared apply bar and mutations.
 */
export type PreprocessingApplyMode = 'create' | 'update';
