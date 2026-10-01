/**
 * Opens the Settings dialog at a chosen tab from anywhere in the app
 * (issue 249). The header's Settings button renders the dialog from this
 * store; the LDaCA loader's Update access token opens it at Portal.
 */
import { create } from 'zustand';

export type SettingsTab = 'general' | 'portal' | 'ai' | 'workspace' | 'views' | 'guidance';

interface SettingsDialogState {
  open: boolean;
  /** The tab the dialog opens at. */
  tab: SettingsTab;
  /** Increments when the LDaCA access token is saved or removed. */
  portalTokenRevision: number;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  notifyPortalTokenChanged: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>()((set) => ({
  open: false,
  tab: 'general',
  portalTokenRevision: 0,
  openSettings: (tab = 'general') => {
    set({ open: true, tab });
  },
  closeSettings: () => {
    set({ open: false });
  },
  notifyPortalTokenChanged: () => {
    set((state) => ({ portalTokenRevision: state.portalTokenRevision + 1 }));
  },
}));
