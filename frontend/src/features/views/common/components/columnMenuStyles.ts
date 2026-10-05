/**
 * Column-picker menus (Show metadata, Compare to): long column names, such as
 * survey questions, wrap inside their own row instead of overlapping the next
 * one, and the menu widens to fit most names first (issue 313).
 * Used by: MetadataColumnSelector, ColumnComparison.
 */
// The app's root font is 13px, so 32rem is about 416px.
export const COLUMN_MENU_CLASS = 'w-max min-w-56 max-w-[min(32rem,calc(100vw-2rem))]';
export const COLUMN_MENU_ITEM_CLASS =
  // `!` beats the menu row's fixed height, which tailwind-merge cannot see as a height.
  'h-auto! min-h-control-sm py-1 leading-snug whitespace-normal [overflow-wrap:anywhere]';
