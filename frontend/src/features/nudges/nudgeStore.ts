/**
 * Whether Suggestions are on (issue 360). GuidanceProvider copies the account
 * preference here, so suggestion cards and the disabled-button outline can
 * check it without loading preferences themselves. On until the preference
 * says otherwise.
 */
import { create } from 'zustand';

interface NudgeState {
  enabled: boolean;
  /**
   * Cards showing each suggestion, first come first. Only the first shows, so
   * two empty Previews side by side give one suggestion, not two.
   */
  holders: Readonly<Record<string, readonly string[]>>;
  setEnabled: (enabled: boolean) => void;
  hold: (id: string, holder: string) => void;
  release: (id: string, holder: string) => void;
}

export const useNudgeStore = create<NudgeState>()((set) => ({
  enabled: true,
  holders: {},
  setEnabled: (enabled) => {
    set({ enabled });
  },
  hold: (id, holder) => {
    set((state) => ({
      holders: { ...state.holders, [id]: [...(state.holders[id] ?? []), holder] },
    }));
  },
  release: (id, holder) => {
    set((state) => ({
      holders: {
        ...state.holders,
        [id]: (state.holders[id] ?? []).filter((candidate) => candidate !== holder),
      },
    }));
  },
}));
