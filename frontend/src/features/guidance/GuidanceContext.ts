import { createContext, useContext } from 'react';
import type { ContextualHintVisitEvent } from './contextualHintVisitState';
import type { ViewType } from '@/features/views/viewIds';
import type { SettingsGuide } from '@/stores/settingsDialogStore';

export interface GuidanceContextValue {
  dispatchContextualHintVisit: (event: ContextualHintVisitEvent) => void;
  startGuidedTour: (id: string) => void;
  /** Walks people to one setting: the gear, then the tab and the option (issue 358). */
  startSettingsWalk: (guide: SettingsGuide) => void;
}

export const GuidanceContext = createContext<GuidanceContextValue | null>(null);
export const GuidanceVisitContext = createContext<ViewType | null>(null);

export function useGuidance() {
  const context = useContext(GuidanceContext);
  if (!context) {
    throw new Error('useGuidance must be used within GuidanceProvider');
  }
  const view = useContext(GuidanceVisitContext);
  return {
    reachContextualHint: (id: string) => {
      if (!view) {
        throw new Error('reachContextualHint must be used within GuidanceVisitBoundary');
      }
      context.dispatchContextualHintVisit({ type: 'reach', view, id });
    },
    startGuidedTour: context.startGuidedTour,
  };
}

export function useGuidanceInfrastructure() {
  const context = useContext(GuidanceContext);
  if (!context) {
    throw new Error('Guidance infrastructure must be used within GuidanceProvider');
  }
  return context;
}

/** The settings walk, or null outside GuidanceProvider (Suggestions, issue 360). */
export function useSettingsWalk() {
  return useContext(GuidanceContext)?.startSettingsWalk ?? null;
}
