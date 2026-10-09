/**
 * The Suggestions outline (issue 360). A suggestion points to the settings
 * that may help by outlining them: elements carry `data-nudge-target` names,
 * and an outline is an attribute that CSS draws. It never blocks a click, needs
 * no closing, and fades once people carry on with other things.
 */
import { useNudgeStore } from './nudgeStore';

const NUDGE_TARGET_ATTRIBUTE = 'data-nudge-target';
const ACTIVE_ATTRIBUTE = 'data-nudge-active';
/** Marks a suggestion card; actions inside it do not count as other actions. */
export const NUDGE_CARD_ATTRIBUTE = 'data-nudge-card';

/** Other actions (clicks, key presses) before an outline fades. */
const OUTLINE_FADE_AFTER_ACTIONS = 3;
/** An outline fades after this long even without other actions. */
const OUTLINE_FADE_AFTER_MS = 20_000;
/** Matches the CSS transition on `[data-nudge-active="fading"]`. */
export const NUDGE_FADE_MS = 600;

/** Spread on an element a suggestion can point to: `{...nudgeTargetProps('topic-max-cluster-size')}`. */
export const nudgeTargetProps = (name: string) => ({ [NUDGE_TARGET_ATTRIBUTE]: name });

interface WatchOptions {
  /** Actions on these elements are part of the suggestion, not other actions. */
  isOwnAction: (target: Element) => boolean;
  actions: number;
  timeoutMs?: number;
  onFade: () => void;
}

/**
 * Calls `onFade` after a number of other clicks or key presses, or after a
 * timeout. Listens from the next tick, so the click that started it does not
 * count. Returns a function that stops listening.
 */
export function fadeAfterOtherActions({
  isOwnAction,
  actions,
  timeoutMs,
  onFade,
}: WatchOptions): () => void {
  let remaining = actions;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (done) return;
    stop();
    onFade();
  };
  const onAction = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && isOwnAction(target)) return;
    remaining -= 1;
    if (remaining <= 0) finish();
  };
  const start = setTimeout(() => {
    document.addEventListener('pointerdown', onAction, true);
    document.addEventListener('keydown', onAction, true);
    if (timeoutMs !== undefined) timer = setTimeout(finish, timeoutMs);
  }, 0);
  function stop() {
    done = true;
    clearTimeout(start);
    clearTimeout(timer);
    document.removeEventListener('pointerdown', onAction, true);
    document.removeEventListener('keydown', onAction, true);
  }
  return stop;
}

const targetSelector = (name: string) => `[${NUDGE_TARGET_ATTRIBUTE}~="${CSS.escape(name)}"]`;

/** Elements outlined now; a new outline replaces the previous one. */
let current: { elements: HTMLElement[]; stop: () => void } | null = null;

function clearOutline(elements: HTMLElement[]) {
  for (const element of elements) element.removeAttribute(ACTIVE_ATTRIBUTE);
}

/**
 * Outlines every element carrying one of the target names. With `scroll`,
 * brings the first one into view. Returns a function that removes this
 * outline at once (if still shown), or null when no target is on screen.
 */
export function outlineNudgeTargets(
  names: readonly string[],
  { scroll = false }: { scroll?: boolean } = {},
): (() => void) | null {
  if (current) {
    current.stop();
    clearOutline(current.elements);
    current = null;
  }
  const elements = names.flatMap((name) =>
    Array.from(document.querySelectorAll<HTMLElement>(targetSelector(name))),
  );
  if (elements.length === 0) return null;
  for (const element of elements) element.setAttribute(ACTIVE_ATTRIBUTE, '');
  if (scroll) elements[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const session = {
    elements,
    stop: fadeAfterOtherActions({
      isOwnAction: (target) =>
        elements.some((element) => element.contains(target)) ||
        target.closest(`[${NUDGE_CARD_ATTRIBUTE}]`) !== null,
      actions: OUTLINE_FADE_AFTER_ACTIONS,
      timeoutMs: OUTLINE_FADE_AFTER_MS,
      onFade: () => {
        for (const element of elements) element.setAttribute(ACTIVE_ATTRIBUTE, 'fading');
        setTimeout(() => {
          if (current === session) current = null;
          clearOutline(
            elements.filter((element) => element.getAttribute(ACTIVE_ATTRIBUTE) === 'fading'),
          );
        }, NUDGE_FADE_MS);
      },
    }),
  };
  current = session;
  return () => {
    if (current !== session) return;
    session.stop();
    clearOutline(elements);
    current = null;
  };
}

/**
 * Outlines what a disabled control is waiting for, when Suggestions are on
 * (issue 360): for example the tokeniser when people click a disabled Run.
 */
export function outlineMissingInputs(names: readonly string[]) {
  if (!useNudgeStore.getState().enabled) return;
  outlineNudgeTargets(names, { scroll: true });
}
