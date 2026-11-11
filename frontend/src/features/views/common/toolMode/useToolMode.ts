import type { ToolMode } from './ToolModeContext';
import {
  readToolModeDeviceDefault,
  resolveToolAdvanced,
  TOOL_ADVANCED_SETTING,
  writeToolModeDeviceDefault,
} from './toolMode';

interface UseToolModeArgs {
  /** The tab's settings and their setter, from the analysis feature host. */
  host: { settings: Record<string, string>; setSetting: (key: string, value: string) => void };
  /** Names the tool, as passed to AnalysisSplitLayout. */
  viewId: string;
  /** The tab's last run used an advanced setting, so the tab opens showing it. */
  lastRunUsedAdvanced: boolean;
}

/**
 * A tab's Basic or Advanced mode and its setter.
 * Used by: analysis features that have advanced settings; they provide the
 * result through ToolModeContext and build their request from the Basic view
 * of the draft while `advanced` is false.
 */
export function useToolMode({ host, viewId, lastRunUsedAdvanced }: UseToolModeArgs): ToolMode {
  const advanced = resolveToolAdvanced({
    stored: host.settings[TOOL_ADVANCED_SETTING],
    lastRunUsedAdvanced,
    deviceDefault: readToolModeDeviceDefault(viewId),
  });
  return {
    advanced,
    setAdvanced: (next) => {
      host.setSetting(TOOL_ADVANCED_SETTING, next ? 'true' : 'false');
      writeToolModeDeviceDefault(viewId, next);
    },
  };
}
