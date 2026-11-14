import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import HelpIcon from '@/components/help/HelpIcon';
import InfoIcon from '@/components/help/InfoIcon';
import type { DocumentKey } from '@/tutorials/documentationRegistry';

export interface AnalysisFeatureHeaderProps {
  /** Title shown in the header — string or arbitrary node. */
  title: React.ReactNode;
  /** Tutorial-registry key for the info icon. */
  infoKey: DocumentKey<'info'>;
  /** Accessible label / tooltip body for the info icon. */
  infoLabel: string;
  infoTooltip?: string;
  /** Tutorial-registry key for the help icon. */
  helpKey: DocumentKey<'tutorial'>;
  helpLabel: string;
  helpTooltip?: string;
  /** Sits at the right end of the header, such as the Advanced switch. */
  action?: React.ReactNode;
}

/**
 * Shared header for every analytic tool's primary card. Owns the
 * title + info/help icons in a shared ``<CardHeader>`` block.
 * Used by: concordance parameter panel.
 */
export function AnalysisFeatureHeader({
  title,
  infoKey,
  infoLabel,
  infoTooltip,
  helpKey,
  helpLabel,
  helpTooltip,
  action,
}: AnalysisFeatureHeaderProps) {
  return (
    <CardHeader className="space-y-0 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <CardTitle className="flex items-center gap-2">
          {title}
          <InfoIcon targetKey={infoKey} label={infoLabel} tooltip={infoTooltip} />
          <HelpIcon targetKey={helpKey} label={helpLabel} tooltip={helpTooltip} />
        </CardTitle>
        {action}
      </div>
    </CardHeader>
  );
}
