import type { ReactNode } from 'react';
import type { Step, StepTarget } from 'react-joyride';

export interface ContextualHintDefinition {
  id: string;
  version: number;
  target: StepTarget;
  placement?: Step['placement'];
  title?: ReactNode;
  content: ReactNode;
}

export interface GuidedTourDefinition {
  id: string;
  steps: {
    id: string;
    target: StepTarget;
    title?: ReactNode;
    content: ReactNode;
    placement?: Step['placement'];
    /** Let people click the pointed-out element itself, such as a button to open. */
    clickTarget?: boolean;
    /** The step's buttons, when not Back, Skip and Next. */
    buttons?: Step['buttons'];
  }[];
}
