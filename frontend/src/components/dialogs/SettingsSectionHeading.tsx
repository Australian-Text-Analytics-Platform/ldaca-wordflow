import type { ReactNode } from 'react';

import HelpIcon from '@/components/help/HelpIcon';
import type { DocumentKey } from '@/tutorials/documentationRegistry';

interface SettingsSectionHeadingProps {
  title: string;
  /** The section of the Settings Help page this group's icon opens. */
  helpKey: DocumentKey<'tutorial'>;
  /** The icon's name and tooltip, such as "About tool caches". */
  helpLabel: string;
  /** Shown after the icon, such as a status badge. */
  children?: ReactNode;
}

/**
 * The heading of one group in Settings, with the group's one help icon
 * (issue 488): each group has one icon, not one per control.
 * Rendered by: SettingsDialog and the panels it shows.
 */
export function SettingsSectionHeading({
  title,
  helpKey,
  helpLabel,
  children,
}: SettingsSectionHeadingProps) {
  return (
    <div className="flex items-center gap-1">
      <h3 className="text-body font-semibold">{title}</h3>
      <SettingsHelpIcon helpKey={helpKey} helpLabel={helpLabel} />
      {children}
    </div>
  );
}

/**
 * The help icon used beside headings and single options in Settings. Its
 * tooltip is `helpLabel` unless `helpTooltip` says more.
 */
export function SettingsHelpIcon({
  helpKey,
  helpLabel,
  helpTooltip,
}: Pick<SettingsSectionHeadingProps, 'helpKey' | 'helpLabel'> & { helpTooltip?: string }) {
  return (
    <HelpIcon
      targetKey={helpKey}
      label={helpLabel}
      tooltip={helpTooltip}
      className="h-5 w-5 shrink-0 text-description"
    />
  );
}
