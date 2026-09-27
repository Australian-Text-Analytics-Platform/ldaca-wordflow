import { useLayoutEffect, useRef } from 'react';

/**
 * Keeps a table's box from shrinking while React replaces its rows (issue 209).
 *
 * When a sort or page change replaces rows, React removes the old rows before
 * inserting the new ones. WebKit can lay the page out in between, and the
 * scrolling pane around the table is then briefly shorter, so the browser
 * clamps its scroll position and the pane jumps up; no script scrolls it.
 *
 * Flow: attach the returned ref to the element that wraps the table. After
 * every render the wrapper's minimum height is set to the table's current
 * height, so during the next update the wrapper cannot get shorter than the
 * table was. A real change in height (fewer rows) still applies once the
 * update is done.
 */
export function useStableTableHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const wrapper = ref.current;
    const content = wrapper?.firstElementChild;
    if (!wrapper || !content) return;
    const height = Math.ceil(content.getBoundingClientRect().height);
    const next = height > 0 ? `${String(height)}px` : '';
    if (wrapper.style.minHeight !== next) wrapper.style.minHeight = next;
  });
  return ref;
}
