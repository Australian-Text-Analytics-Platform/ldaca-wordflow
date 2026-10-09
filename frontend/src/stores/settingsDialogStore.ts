/**
 * Opens the Settings dialog at a chosen tab from anywhere in the app
 * (issue 249). The header's Settings button renders the dialog from this
 * store; the LDaCA loader's Update access token opens it at Portal.
 */
import { create } from 'zustand';

export type SettingsTab = 'general' | 'portal' | 'ai' | 'workspace' | 'views' | 'guidance';

/** A setting the dialog walks people to, step by step (issue 358). */
export type SettingsGuide = 'contextual-hints' | 'multi-tab' | 'suggestions';

interface SettingsDialogState {
  open: boolean;
  /** The tab the dialog opens at. */
  tab: SettingsTab;
  /**
   * Set by a hint's Turn off hints: when Settings is next opened, it points
   * out the Guidance tab, then the option. Ends when the dialog closes.
   */
  guide: SettingsGuide | null;
  /** Increments when the LDaCA access token is saved or removed. */
  portalTokenRevision: number;
  openSettings: (tab?: SettingsTab) => void;
  startGuide: (guide: SettingsGuide) => void;
  endGuide: () => void;
  closeSettings: () => void;
  notifyPortalTokenChanged: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>()((set) => ({
  open: false,
  tab: 'general',
  guide: null,
  portalTokenRevision: 0,
  openSettings: (tab = 'general') => {
    set({ open: true, tab });
  },
  closeSettings: () => {
    set({ open: false, guide: null });
  },
  startGuide: (guide) => {
    set({ guide });
  },
  endGuide: () => {
    set({ guide: null });
  },
  notifyPortalTokenChanged: () => {
    set((state) => ({ portalTokenRevision: state.portalTokenRevision + 1 }));
  },
}));
