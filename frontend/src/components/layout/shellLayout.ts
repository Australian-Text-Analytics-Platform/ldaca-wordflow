import type { MaximisedSurface } from '@/stores/layoutFocusStore';

export interface ShellRegions {
  /** The sidebar and its resize handle. */
  sidebarHidden: boolean;
  /** The centre column: the active tool. */
  mainHidden: boolean;
  /** The right column: Project Graph and Data Editor. */
  asideHidden: boolean;
  /** The handle between the centre and right columns. */
  handleHidden: boolean;
  mainWidth: string;
  asideWidth: string;
}

/**
 * Which shell regions show, and how wide the two columns are.
 * Used by: WorkspaceShell. A maximised surface takes the whole width and the
 * other regions are hidden, not unmounted; the split ratio and the right
 * panel's collapsed state are read, never changed, so restoring gives the
 * same layout back.
 */
export function shellRegions({
  maximised,
  isRightCollapsed,
  asidePanelRatio,
}: {
  maximised: MaximisedSurface | null;
  isRightCollapsed: boolean;
  asidePanelRatio: number;
}): ShellRegions {
  if (maximised === 'analysis') {
    return {
      sidebarHidden: true,
      mainHidden: false,
      asideHidden: true,
      handleHidden: true,
      mainWidth: '100%',
      asideWidth: '0px',
    };
  }
  if (maximised === 'data-editor') {
    return {
      sidebarHidden: true,
      mainHidden: true,
      asideHidden: false,
      handleHidden: true,
      mainWidth: '0px',
      asideWidth: '100%',
    };
  }
  return {
    sidebarHidden: false,
    mainHidden: false,
    asideHidden: false,
    handleHidden: isRightCollapsed,
    mainWidth: isRightCollapsed ? '100%' : `${String((1 - asidePanelRatio) * 100)}%`,
    asideWidth: isRightCollapsed ? '0px' : `${String(asidePanelRatio * 100)}%`,
  };
}
