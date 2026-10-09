import { CircleHelp, Info, Quote, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores';
import {
  getDocumentTarget,
  type DocLinkKind,
  type DocumentKey,
} from '@/tutorials/documentationRegistry';

interface DocLinkConfig {
  Icon: LucideIcon;
  defaultLabel: string;
  defaultClassName: string;
  missingMessage: string;
}

/** Documentation modal configuration consumed by `DocLinkIcon` for each icon kind. */
const CONFIG: Record<DocLinkKind, DocLinkConfig> = {
  tutorial: {
    Icon: CircleHelp,
    defaultLabel: 'Learn more',
    defaultClassName: 'h-6 w-6 text-description',
    missingMessage: 'No anchor found for this help item.',
  },
  info: {
    Icon: Info,
    defaultLabel: 'More info',
    defaultClassName: 'h-6 w-6 text-link',
    missingMessage: 'No anchor found for this information item.',
  },
  reference: {
    Icon: Quote,
    defaultLabel: 'View reference',
    defaultClassName: 'h-6 w-6',
    missingMessage: 'No anchor found for this reference item.',
  },
};

export interface DocLinkIconProps<Kind extends DocLinkKind> {
  kind: Kind;
  targetKey: DocumentKey<Kind>;
  label?: string;
  tooltip?: string;
  className?: string;
  iconClassName?: string;
  /** Where the tooltip opens; `top` unless it would cover a nearby control. */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Unified documentation icon used by the Help/Info/Reference wrappers. It
 * resolves registry keys, opens the matching modal through `useUIStore`, and
 * gives callers a shared tooltip/button treatment for documentation links.
 * Why: help, info, and reference affordances share registry lookup, missing-target feedback, and modal dispatch.
 * Flow: choose the icon config, resolve label and tooltip text, open the registry target or toast when missing, then render the icon button.
 */
export function DocLinkIcon<Kind extends DocLinkKind>({
  kind,
  targetKey,
  label,
  tooltip,
  className,
  iconClassName,
  tooltipSide = 'top',
}: DocLinkIconProps<Kind>) {
  const config = CONFIG[kind];
  const resolvedLabel = label ?? config.defaultLabel;
  const tooltipText = tooltip ?? resolvedLabel;
  const Icon = config.Icon;

  /** Called by: the DocLinkIcon button onClick prop. */
  const handleClick = () => {
    const target = getDocumentTarget(kind, targetKey);
    if (!target) {
      toast(config.missingMessage);
      return;
    }
    useUIStore.getState().openDocument(target);
  };

  // A link, not a <button>: analysis panels wrap their parameters in
  // <fieldset disabled> while a run is in progress, which disables every
  // button inside, and help must stay open-able then. It keeps the button role
  // and answers Space as well as Enter.
  const anchor = getDocumentTarget(kind, targetKey)?.anchor;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={className ?? config.defaultClassName}
        >
          <a
            href={anchor ? `#${anchor}` : '#'}
            role="button"
            aria-label={resolvedLabel}
            onClick={(event) => {
              event.preventDefault();
              handleClick();
            }}
            onKeyDown={(event) => {
              if (event.key === ' ') {
                event.preventDefault();
                handleClick();
              }
            }}
          >
            <Icon className={iconClassName ?? 'h-4 w-4'} />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
