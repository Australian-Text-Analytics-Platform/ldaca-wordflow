import type { SettingsGuide, SettingsTab } from '@/stores/settingsDialogStore';
import type { GuidedTourDefinition } from './types';

/**
 * How to walk people to one setting (issue 358, 359): a tour step on the
 * Settings gear, then, inside Settings, a note pointing to the tab and one
 * pointing to the option. People change the option themselves, so they learn
 * where it is and can change it back. Chao's rule: anything that needs
 * Settings, or a few hops, is shown step by step rather than done for them.
 */
interface SettingsWalk {
  tab: SettingsTab;
  /** The tab's name as Settings lists it. */
  tabLabel: string;
  tourTitle: string;
  tourContent: string;
  /** Shown in Settings until the tab is open. */
  tabNote: string;
  /** Shown on the tab, beside the highlighted option. */
  settingNote: string;
}

export const SETTINGS_WALKS: Readonly<Record<SettingsGuide, SettingsWalk>> = {
  'contextual-hints': {
    tab: 'guidance',
    tabLabel: 'Guidance',
    tourTitle: 'Hints are turned off in Settings',
    tourContent:
      'Click Settings, the gear here. Hints are turned off there, and turned back on there too.',
    tabNote: 'To turn hints off, open Guidance on the left.',
    settingNote:
      'Untick Show contextual hints to turn hints off. Come back here to turn them on again.',
  },
  'multi-tab': {
    tab: 'general',
    tabLabel: 'General',
    tourTitle: 'Tabs are turned off in Settings',
    tourContent:
      'Click Settings, the gear here. Tabs are turned off there, and turned back on there too.',
    tabNote: 'To turn tabs off, open General on the left.',
    settingNote:
      'Turn off Enable multi-tab to keep one tab in each tool. Come back here to turn tabs on again.',
  },
};

const TOUR_PREFIX = 'settings-walk:';

/** The tour step on the Settings gear; it waits for a click on the gear itself. */
export const settingsWalkTour = (guide: SettingsGuide): GuidedTourDefinition => ({
  id: `${TOUR_PREFIX}${guide}`,
  steps: [
    {
      id: `${TOUR_PREFIX}${guide}:settings-button`,
      target: '[data-guidance="settings-button"]',
      title: SETTINGS_WALKS[guide].tourTitle,
      content: SETTINGS_WALKS[guide].tourContent,
      placement: 'bottom-end',
      clickTarget: true,
      // Joyride shows no Skip on a last step; Close leaves the walk.
      buttons: ['close'],
    },
  ],
});

export const isSettingsWalkTour = (id: string): boolean => id.startsWith(TOUR_PREFIX);
