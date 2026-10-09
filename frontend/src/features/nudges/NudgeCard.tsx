import { Lightbulb } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useSettingsWalk } from '@/features/guidance/GuidanceContext';
import { cn } from '@/lib/utils';
import {
  fadeAfterOtherActions,
  NUDGE_CARD_ATTRIBUTE,
  NUDGE_FADE_MS,
  outlineNudgeTargets,
} from './nudgeHighlight';
import { type NudgeDefinition, type NudgeId, NUDGES } from './nudges';
import { useNudgeStore } from './nudgeStore';
import { useUIStore } from '@/stores/uiStore';
import { type DocumentKey, getDocumentTarget } from '@/tutorials/documentationRegistry';

/** Other actions (clicks, key presses) before a suggestion card fades. */
const CARD_FADE_AFTER_ACTIONS = 6;

interface NudgeCardProps {
  id: NudgeId;
  /**
   * Identifies this occurrence of the situation. A new value shows the
   * suggestion again, even after it faded.
   */
  occurrence: string | number;
  /** An extra sentence before the message, such as the numbers that set it off. */
  detail?: string;
  className?: string;
}

/**
 * A suggestion beside a result or run (issue 360). It outlines the settings
 * that may help for as long as it shows, needs no closing, and fades once people carry on with other
 * things. Hidden when Suggestions are turned off in Settings.
 */
export function NudgeCard({ occurrence, ...props }: NudgeCardProps) {
  const enabled = useNudgeStore((state) => state.enabled);
  const holder = useId();
  const first = useNudgeStore((state) => state.holders[props.id]?.[0] === holder);
  useEffect(() => {
    const { hold, release } = useNudgeStore.getState();
    hold(props.id, holder);
    return () => {
      release(props.id, holder);
    };
  }, [props.id, holder]);
  if (!enabled || !first) return null;
  return <NudgeCardOccurrence key={String(occurrence)} {...props} />;
}

type Phase = 'shown' | 'fading' | 'gone';

/** Opens a help section in the Help window. */
function openHelp(key: DocumentKey<'tutorial'> | undefined) {
  const target = key ? getDocumentTarget('tutorial', key) : null;
  if (target) useUIStore.getState().openDocument(target);
}

function NudgeCardOccurrence({ id, detail, className }: Omit<NudgeCardProps, 'occurrence'>) {
  const nudge: NudgeDefinition = NUDGES[id];
  const startSettingsWalk = useSettingsWalk();
  const [phase, setPhase] = useState<Phase>('shown');

  // The card's outline lasts as long as the card and fades with it. It is
  // put back after each render, so targets that appear later are outlined.
  useEffect(() => {
    if (phase !== 'shown') return;
    const release = outlineNudgeTargets(nudge.targets, { untilReleased: true });
    return () => {
      release?.({ fade: true });
    };
  });

  useEffect(() => {
    return fadeAfterOtherActions({
      isOwnAction: (target) => target.closest(`[${NUDGE_CARD_ATTRIBUTE}]`) !== null,
      actions: CARD_FADE_AFTER_ACTIONS,
      onFade: () => {
        setPhase('fading');
      },
    });
  }, []);

  useEffect(() => {
    if (phase !== 'fading') return;
    const timer = setTimeout(() => {
      setPhase('gone');
    }, NUDGE_FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  if (phase === 'gone') return null;

  return (
    <div
      {...{ [NUDGE_CARD_ATTRIBUTE]: id }}
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border border-warning/60 bg-warning-background/40 px-3 py-2 text-label-secondary text-foreground transition-opacity duration-500',
        phase === 'fading' && 'opacity-0',
        className,
      )}
    >
      <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 space-y-1">
        <p>
          <span className="font-medium">{nudge.title}. </span>
          {detail ? `${detail} ` : null}
          {nudge.message}
        </p>
        <div className="flex flex-wrap items-center gap-x-3">
          {nudge.help ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => {
                openHelp(nudge.help);
              }}
            >
              Learn more
            </Button>
          ) : null}
          {startSettingsWalk ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-description"
              onClick={() => {
                startSettingsWalk('suggestions');
              }}
            >
              Turn off suggestions…
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
