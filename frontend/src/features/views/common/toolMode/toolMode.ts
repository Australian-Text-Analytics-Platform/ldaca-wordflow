/**
 * Basic and Advanced tool modes.
 *
 * A tool that has advanced settings shows an Advanced switch. In Basic the
 * tool hides those settings and sends their defaults, so a hidden setting
 * never affects a run; the hidden draft is kept and comes back when Advanced
 * is turned on again. Each tool owns a pure function that returns its draft
 * with every advanced setting at its default.
 *
 * The mode is a tab setting, kept on this device like the chart type. A tab
 * with no choice yet opens in Advanced when its last run used an advanced
 * setting, and otherwise in the mode last chosen for that tool on this device.
 */

import { APP_VERSION } from '@/config/env';

/** Tab setting that holds a tab's mode: `'true'` for Advanced. */
export const TOOL_ADVANCED_SETTING = 'tool.advanced';

const deviceDefaultKey = (viewId: string) => `ldaca.toolMode.${viewId}`;

/** Whether the tool was last switched to Advanced on this device. */
export const readToolModeDeviceDefault = (viewId: string): boolean => {
  try {
    return window.localStorage.getItem(deviceDefaultKey(viewId)) === 'advanced';
  } catch {
    return false;
  }
};

/** Remembers the mode a new tab of this tool starts in; storage failures are ignored. */
export const writeToolModeDeviceDefault = (viewId: string, advanced: boolean) => {
  try {
    window.localStorage.setItem(deviceDefaultKey(viewId), advanced ? 'advanced' : 'basic');
  } catch {
    // Private windows can refuse storage; the tab setting still holds the mode.
  }
};

const advancedHintKey = (viewId: string) => `ldaca.toolMode.${viewId}.advancedHintDismissed`;

/**
 * Whether Got it was chosen on this tool's Advanced hint on this device, in
 * this version of Wordflow. The dismissal holds the version it was made in,
 * so the hint shows again after each update (Chao, 19 Nov 2026): an update
 * can add settings under Advanced.
 */
export const readAdvancedHintDismissed = (viewId: string, version = APP_VERSION): boolean => {
  try {
    return window.localStorage.getItem(advancedHintKey(viewId)) === (version || 'dev');
  } catch {
    return false;
  }
};

/** Hides this tool's Advanced hint on this device until the next update; storage failures are ignored. */
export const dismissAdvancedHint = (viewId: string, version = APP_VERSION) => {
  try {
    window.localStorage.setItem(advancedHintKey(viewId), version || 'dev');
  } catch {
    // Private windows can refuse storage; the hint then stays hidden until the page reloads.
  }
};

/** A tab's mode: its own choice, else what its last run used, else the device's last choice. */
export const resolveToolAdvanced = ({
  stored,
  lastRunUsedAdvanced,
  deviceDefault,
}: {
  stored: string | undefined;
  lastRunUsedAdvanced: boolean;
  deviceDefault: boolean;
}): boolean => {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return lastRunUsedAdvanced || deviceDefault;
};
