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
 * Calls `onFade` after a number of other actions, or after a timeout. An
 * action is a click, or Enter or Escape; typing in a field is not, so setting
 * up a run does not wear a suggestion out key by key. Listens from the next tick, so the click that started it does not
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
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== 'Escape') return;
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

function fadeOutline(elements: HTMLElement[]) {
  for (const element of elements) element.setAttribute(ACTIVE_ATTRIBUTE, 'fading');
  setTimeout(() => {
    // Only what is still fading: a newer outline may have taken an element.
    clearOutline(elements.filter((element) => element.getAttribute(ACTIVE_ATTRIBUTE) === 'fading'));
  }, NUDGE_FADE_MS);
}

/** Removes an outline: at once, or with `fade`, fading out. */
export type ReleaseOutline = (options?: { fade?: boolean }) => void;

/**
 * Outlines every element carrying one of the target names. With `scroll`,
 * brings the first one into view. On its own the outline fades after other
 * actions or a timeout; `untilReleased` leaves that to the caller (a
 * suggestion card's outline lasts as long as the card). Returns the release,
 * or null when no target is on screen.
 */
export function outlineNudgeTargets(
  names: readonly string[],
  { scroll = false, untilReleased = false }: { scroll?: boolean; untilReleased?: boolean } = {},
): ReleaseOutline | null {
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
    stop: untilReleased
      ? () => undefined
      : fadeAfterOtherActions({
          isOwnAction: (target) => elements.some((element) => element.contains(target)),
          actions: OUTLINE_FADE_AFTER_ACTIONS,
          timeoutMs: OUTLINE_FADE_AFTER_MS,
          onFade: () => {
            if (current === session) current = null;
            fadeOutline(elements);
          },
        }),
  };
  current = session;
  return ({ fade = false } = {}) => {
    if (current !== session) return;
    session.stop();
    current = null;
    if (fade) fadeOutline(elements);
    else clearOutline(elements);
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
