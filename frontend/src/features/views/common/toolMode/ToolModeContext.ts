import { createContext, useContext } from 'react';

export interface ToolMode {
  /** Whether the tool shows and sends its advanced settings. */
  advanced: boolean;
  setAdvanced: (advanced: boolean) => void;
}

/** The mode of the analysis tool around a component; null in a tool without modes. */
export const ToolModeContext = createContext<ToolMode | null>(null);

export const useToolModeContext = (): ToolMode | null => useContext(ToolModeContext);
