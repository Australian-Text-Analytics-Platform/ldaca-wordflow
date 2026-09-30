import { useContext, type ReactNode } from 'react';
import { NodeInputCardContext } from './nodeInputCardContext';
import { TruncatedTooltip } from './TruncatedTooltip';
import { cn } from '@/lib/utils';

export function NodeInputField({
  label,
  value,
  children,
  className,
}: {
  label?: ReactNode;
  value?: string;
  children: ReactNode;
  className?: string;
}) {
  const inline = useContext(NodeInputCardContext);
  const content = (
    <div
      data-node-input-field={inline || undefined}
      className={cn(
        inline
          ? 'flex min-w-0 flex-[1_1_14rem] flex-wrap items-center gap-x-2 gap-y-1'
          : 'min-w-0 space-y-1',
        className,
      )}
    >
      {label && (
        <span
          className={cn(
            'text-label-secondary text-description',
            inline ? 'shrink-0' : 'block font-medium',
          )}
        >
          {inline && typeof label === 'string' ? `${label.replace(/:\s*$/, '')}:` : label}
        </span>
      )}
      <div className={inline ? 'min-w-0 flex-[1_1_7rem]' : undefined}>{children}</div>
    </div>
  );
  return inline && value ? <TruncatedTooltip text={value}>{content}</TruncatedTooltip> : content;
}
