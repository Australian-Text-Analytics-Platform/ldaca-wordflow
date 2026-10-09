import type { ReactNode } from 'react';
import type { Step, StepTarget } from 'react-joyride';
import type { SettingsGuide } from '@/stores/settingsDialogStore';

export interface ContextualHintDefinition {
  id: string;
  version: number;
  target: StepTarget;
  placement?: Step['placement'];
  title?: ReactNode;
  content: ReactNode;
  /** A setting this hint can walk people to, such as turning tabs off (issue 359). */
  settingsWalk?: { label: string; guide: SettingsGuide };
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
