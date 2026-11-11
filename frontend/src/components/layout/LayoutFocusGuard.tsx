import { useEffect } from 'react';

import { useModalLayerStore } from '@/features/guidance/modalLayerStore';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { useUIStore } from '@/stores';
import { useLayoutFocusStore } from '@/stores/layoutFocusStore';

/** Escape belongs to these while focus is in them: a field being edited, a dialog, a menu, a list. */
const ESCAPE_OWNERS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Whether an Escape key press should restore the normal layout: nothing else
 * handled it (Radix marks the Escape it uses as handled), no dialog is open,
 * and it was not pressed in a field, menu or list that uses it.
 */
function escapeRestoresLayout(event: KeyboardEvent, openModals: number): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || openModals > 0) return false;
  const target = event.target;
  return !(target instanceof Element && target.closest(ESCAPE_OWNERS) !== null);
}

/**
 * Keeps a maximised surface from outliving what it shows.
 * Rendered by: WorkspaceShell, inside WorkspaceProvider.
 * Flow: restore the normal layout when the view or the Project changes (the
 * sidebar is hidden while maximised, but back and forward, quick access and
 * handoffs between tools still change the view), and on Escape.
 */
export function LayoutFocusGuard() {
  const currentView = useUIStore((state) => state.currentView);
  const { currentWorkspaceId } = useWorkspaceData();

  useEffect(() => {
    useLayoutFocusStore.getState().restore();
  }, [currentView, currentWorkspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useLayoutFocusStore.getState().maximised === null) return;
      if (!escapeRestoresLayout(event, useModalLayerStore.getState().count)) return;
      useLayoutFocusStore.getState().restore();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return null;
}
