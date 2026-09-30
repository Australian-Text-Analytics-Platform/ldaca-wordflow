import { createContext } from 'react';

/** Card descendants share one layout; standalone form fields retain their existing layout. */
export const NodeInputCardContext = createContext(false);
