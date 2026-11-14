import { createContext } from 'react';

/**
 * The active analysis tab's title, for surfaces that hide the tab strip
 * (maximised results name the tab they show). Null where there is no strip.
 */
export const AnalysisTabTitleContext = createContext<string | null>(null);
