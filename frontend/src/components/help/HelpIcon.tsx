import { DocLinkIcon } from './DocLinkIcon';
import type { DocumentKey } from '@/tutorials/documentationRegistry';

interface HelpIconProps {
  targetKey: DocumentKey<'tutorial'>;
  label?: string;
  tooltip?: string;
  className?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Tutorial help icon wrapper used by feature and layout call sites that open tutorial anchors.
 */
function HelpIcon(props: HelpIconProps) {
  return <DocLinkIcon kind="tutorial" {...props} />;
}

export default HelpIcon;
