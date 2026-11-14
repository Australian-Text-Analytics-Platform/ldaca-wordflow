import { create } from 'zustand';

/**
 * What can fill the window: an analysis tool's results, or the Data Editor.
 */
export type MaximisedSurface = 'analysis' | 'data-editor';

interface LayoutFocusState {
  /** The surface that fills the window, or null for the normal layout. */
  maximised: MaximisedSurface | null;
  maximise: (surface: MaximisedSurface) => void;
  restore: () => void;
}

/**
 * Whether one surface is maximised to the window (Monika, Chao).
 *
 * Maximising is a layout state, not an overlay: WorkspaceShell hides the
 * other regions with CSS and leaves them mounted, so charts, tables,
 * selections and parameter drafts are the same after restoring, and every
 * pane size set by hand is untouched. It is not kept across a reload, so
 * nobody reopens Wordflow into a view with no navigation. LayoutFocusGuard
 * restores it when the view or Project changes and on Escape; the owner of
 * each surface restores it when that surface has nothing to show.
 */
export const useLayoutFocusStore = create<LayoutFocusState>((set) => ({
  maximised: null,
  maximise: (surface) => {
    set({ maximised: surface });
  },
  restore: () => {
    set((state) => (state.maximised === null ? state : { maximised: null }));
  },
}));
