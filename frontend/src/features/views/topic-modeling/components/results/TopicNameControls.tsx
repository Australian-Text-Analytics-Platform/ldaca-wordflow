/**
 * Topic names for the result views, through a context so
 * the list, the bubbles and the examples read the same names.
 */
import { Pencil } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useInlineRename } from '@/lib/rename/useInlineRename';
import { topicNameProblem } from '../../topicNames';
import { useTopicNames } from './topicNamesContext';

/** The rename box for one Topic: Enter saves, Esc cancels, empty removes the name. */
export function TopicNameInput({
  groupKey,
  current,
  label,
  onClose,
}: {
  groupKey: string;
  current: string;
  label: string;
  onClose: () => void;
}) {
  const { rename } = useTopicNames();
  const { inputProps } = useInlineRename({
    original: current,
    onSubmit: async (name) => {
      await rename?.(groupKey, name);
    },
    onClose,
    validate: topicNameProblem,
    failureTitle: "Couldn't rename the topic.",
  });
  return (
    <Input
      {...inputProps}
      // The box sits inside clickable cards and bubbles: keep its keys and
      // clicks to itself, so typing a space does not select the Topic.
      onKeyDown={(event) => {
        event.stopPropagation();
        inputProps.onKeyDown(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
      placeholder={label}
      aria-label={`Rename ${label}`}
      className="h-7 w-48 text-body"
    />
  );
}

/** The pencil that starts renaming a Topic; it keeps its click from selecting the Topic. */
export function TopicRenameButton({
  label,
  onRename,
  alwaysVisible = false,
}: {
  label: string;
  onRename: () => void;
  /** Shown all the time; otherwise only while the pointer is over its card. */
  alwaysVisible?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`Rename ${label}`}
      title="Rename"
      className={
        'shrink-0 rounded-sm p-0.5 text-description transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-focus' +
        (alwaysVisible ? '' : ' opacity-0 group-hover/topic-card:opacity-100')
      }
      onClick={(event) => {
        event.stopPropagation();
        onRename();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
    >
      <Pencil className="size-3.5" />
    </button>
  );
}
