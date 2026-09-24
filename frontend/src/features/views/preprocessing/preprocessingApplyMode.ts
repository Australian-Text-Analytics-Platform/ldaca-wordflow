export type PreprocessingApplyMode = 'create' | 'update';

/**
 * Each preprocessing tool has one fixed destination. Tools that can change rows
 * (Filter, Sample, Join, Stack) always create a derived Data Block, because
 * Data Block Edits never change the number or order of rows; column tools
 * (Find, Create) always update the selected Data Block in place.
 */
export const CREATE_DATA_BLOCK_MODE: PreprocessingApplyMode = 'create';
export const UPDATE_DATA_BLOCK_MODE: PreprocessingApplyMode = 'update';
