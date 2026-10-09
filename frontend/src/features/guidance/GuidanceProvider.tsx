import { createContext, type ReactNode, useContext, useEffect, useReducer, useState } from 'react';
import {
  ACTIONS,
  EVENTS,
  type EventData,
  Joyride,
  ORIGIN,
  type Props as JoyrideProps,
  STATUS,
  type Step,
  type TooltipRenderProps,
} from 'react-joyride';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { type SettingsGuide, useSettingsDialogStore } from '@/stores/settingsDialogStore';
import { useNudgeStore } from '@/features/nudges/nudgeStore';
import { useUserPreferences } from '@/features/preferences/useUserPreferences';
import type { ViewType } from '@/features/views/viewIds';
import { useGuidanceAcknowledgmentsStore } from './acknowledgmentsStore';
import {
  contextualHintVisitReducer,
  initialContextualHintVisitState,
  selectContextualHintCandidates,
} from './contextualHintVisitState';
import { GuidanceContext } from './GuidanceContext';
import { useModalLayerStore } from './modalLayerStore';
import {
  contextualHintRegistry,
  contextualHintSequences as productionContextualHintSequences,
  guidedTourRegistry,
} from './registry';
import { isSettingsWalkTour, settingsWalkTour } from './settingsWalks';
import type { ContextualHintDefinition, GuidedTourDefinition } from './types';

type GuidanceSession =
  | {
      kind: 'hint';
      view: ViewType;
      definition: ContextualHintDefinition;
      started: boolean;
    }
  | { kind: 'tour'; definition: GuidedTourDefinition; started: boolean };

// Walks people to a setting: the Settings gear, then its tab and option
// (issues 358, 359). Hints use it for Turn off hints and their own actions.
const SettingsWalkContext = createContext<((guide: SettingsGuide) => void) | null>(null);

const guidanceStyles = {
  floater: { filter: 'none' },
  tooltip: {
    backgroundColor: 'var(--vscode-editorWidget-background)',
    border: '1px solid var(--vscode-widget-border)',
    borderRadius: 'var(--vscode-cornerRadius-large)',
    boxShadow: 'var(--vscode-shadow-lg)',
    color: 'var(--vscode-editorWidget-foreground)',
    fontSize: 13,
    maxWidth: 'calc(100vw - 24px)',
    padding: '16px',
  },
  tooltipContainer: { lineHeight: 1.55, textAlign: 'left' },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: 650,
    letterSpacing: '-0.012em',
    lineHeight: 1.25,
  },
  tooltipContent: {
    color: 'var(--vscode-descriptionForeground)',
    paddingBottom: 16,
    paddingTop: 8,
  },
  tooltipFooter: { borderTop: '1px solid var(--vscode-widget-border)', paddingTop: 12 },
  buttonPrimary: {
    backgroundColor: 'var(--vscode-button-background)',
    borderRadius: 'var(--vscode-cornerRadius-small)',
    boxShadow: 'none',
    color: 'var(--vscode-button-foreground)',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
    padding: '5px 8px',
  },
  buttonBack: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: 12,
    fontWeight: 500,
    padding: '8px 6px',
  },
  buttonSkip: { color: 'var(--vscode-descriptionForeground)', fontSize: 12 },
} satisfies NonNullable<JoyrideProps['styles']>;

function ContextualHintTooltip({
  closeProps,
  primaryProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const startSettingsWalk = useContext(SettingsWalkContext);
  const { content, styles, title } = step;
  const stepData = step.data as
    | { settingsWalk?: ContextualHintDefinition['settingsWalk'] }
    | undefined;
  const settingsWalk = stepData?.settingsWalk;

  return (
    <div
      className="react-joyride__tooltip"
      style={styles.tooltip}
      {...tooltipProps}
      aria-describedby="joyride-tooltip-content"
      aria-label={title ? undefined : 'Contextual hint'}
      aria-labelledby={title ? 'joyride-tooltip-title' : undefined}
    >
      <div style={styles.tooltipContainer}>
        {title ? (
          <h4 id="joyride-tooltip-title" style={styles.tooltipTitle}>
            {title}
          </h4>
        ) : null}
        <div id="joyride-tooltip-content" style={styles.tooltipContent}>
          {content}
        </div>
        {settingsWalk ? (
          <button
            type="button"
            className="mt-2 text-label-secondary text-link hover:underline focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus"
            onClick={() => {
              startSettingsWalk?.(settingsWalk.guide);
            }}
          >
            {settingsWalk.label}
          </button>
        ) : null}
      </div>
      <div style={styles.tooltipFooter} className="flex flex-wrap items-center gap-3">
        <div style={styles.tooltipFooterSpacer}>
          {/* Hints are turned off in Settings, the same place they are turned back
              on, so people see it (Chao, issue 358). */}
          <button
            type="button"
            className="rounded-md border border-surface-border px-3 py-2 text-label-secondary text-foreground transition-colors hover:bg-list-hover focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-focus"
            onClick={() => {
              startSettingsWalk?.('contextual-hints');
            }}
          >
            Turn off hints…
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" style={styles.buttonBack} {...closeProps} />
          <button type="button" style={styles.buttonPrimary} {...primaryProps} />
        </div>
        <p className="order-last w-full text-right text-[11px] text-description">
          Esc = Not now · Enter = Got it
        </p>
      </div>
    </div>
  );
}

export interface GuidanceProviderProps {
  children: ReactNode;
  contextualHints?: readonly ContextualHintDefinition[];
  contextualHintSequences?: Parameters<typeof selectContextualHintCandidates>[1];
  guidedTours?: readonly GuidedTourDefinition[];
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(query.matches);
    };
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  return reduced;
}

function GuidancePresentationBoundary({ children }: { children: ReactNode }) {
  const [started, setStarted] = useState(() => useModalLayerStore.getState().count === 0);

  useEffect(
    () =>
      useModalLayerStore.subscribe((state) => {
        if (state.count === 0) setStarted(true);
      }),
    [],
  );

  return started ? children : null;
}

export function GuidanceProvider({
  children,
  contextualHints = contextualHintRegistry,
  contextualHintSequences = productionContextualHintSequences,
  guidedTours = guidedTourRegistry,
}: GuidanceProviderProps) {
  const userId = useAuth().user?.id ?? null;
  const { data: preferences } = useUserPreferences();
  const modalCount = useModalLayerStore((state) => state.count);
  const acknowledge = useGuidanceAcknowledgmentsStore((state) => state.acknowledge);
  const acknowledgments = useGuidanceAcknowledgmentsStore((state) =>
    userId ? state.byUser[userId] : undefined,
  );
  const [visitState, dispatchContextualHintVisit] = useReducer(
    contextualHintVisitReducer,
    initialContextualHintVisitState,
  );
  const [tourSession, setTourSession] = useState<Extract<GuidanceSession, { kind: 'tour' }> | null>(
    null,
  );
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  const contextualHintsEnabled = preferences?.contextual_hints_enabled === true;
  // Suggestions (issue 360) read this from a store; on until the account says otherwise.
  const nudgesEnabled = preferences?.nudges_enabled !== false;
  useEffect(() => {
    useNudgeStore.getState().setEnabled(nudgesEnabled);
  }, [nudgesEnabled]);

  const candidateIds = selectContextualHintCandidates(visitState, contextualHintSequences);
  const nextDefinition = candidateIds
    .map((id) => contextualHints.find((definition) => definition.id === id))
    .find(
      (definition): definition is ContextualHintDefinition =>
        definition !== undefined && (acknowledgments?.[definition.id] ?? 0) < definition.version,
    );

  // Settings is where hints are turned off and on; never show one over it
  // (issue 358). It also loads a moment after the gear is clicked, before it
  // registers as a dialog.
  const settingsOpen = useSettingsDialogStore((state) => state.open);
  const hintSession: GuidanceSession | null =
    userId &&
    contextualHintsEnabled &&
    !settingsOpen &&
    visitState.activeView &&
    !visitState.paused &&
    nextDefinition
      ? {
          kind: 'hint',
          view: visitState.activeView,
          definition: nextDefinition,
          started: modalCount === 0,
        }
      : null;
  const session: GuidanceSession | null = tourSession
    ? { ...tourSession, started: modalCount === 0 }
    : hintSession;
  const sessionKey = session
    ? `${session.kind}:${session.definition.id}${session.kind === 'hint' ? `:${String(session.definition.version)}` : ''}`
    : null;

  const startGuidedTour = (id: string) => {
    const definition = guidedTours.find((candidate) => candidate.id === id);
    if (!definition) return;
    setTourSession((current) => current ?? { kind: 'tour', definition, started: true });
  };

  const acknowledgeCurrentHint = () => {
    if (session?.kind !== 'hint' || !userId) return;
    acknowledge(userId, session.definition.id, session.definition.version);
    dispatchContextualHintVisit({
      type: 'acknowledge',
      view: session.view,
      id: session.definition.id,
    });
  };

  const deferCurrentHint = () => {
    if (session?.kind !== 'hint') return;
    dispatchContextualHintVisit({
      type: 'defer',
      view: session.view,
    });
  };

  const pauseCurrentHint = (type: 'target-missing' | 'hints-disabled') => {
    if (session?.kind !== 'hint') return;
    dispatchContextualHintVisit({ type, view: session.view });
  };

  const settingsWalkActive = session?.kind === 'tour' && isSettingsWalkTour(session.definition.id);
  const endSettingsWalk = () => {
    if (!useSettingsDialogStore.getState().open) useSettingsDialogStore.getState().endGuide();
    setTourSession((current) =>
      current && isSettingsWalkTour(current.definition.id) ? null : current,
    );
  };

  // The gear step outlines the gear itself, and a click anywhere but the gear
  // or the card closes the walk, so people who meant to ignore it can just
  // carry on (Chao, issue 360).
  useEffect(() => {
    if (!settingsWalkActive) return;
    const gear = document.querySelector<HTMLElement>('[data-guidance="settings-button"]');
    gear?.setAttribute('data-walk-target', '');
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest('[data-guidance="settings-button"]') ||
          target.closest('.react-joyride__floater'))
      ) {
        return;
      }
      endSettingsWalk();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      gear?.removeAttribute('data-walk-target');
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  });

  const steps: Step[] =
    session?.kind === 'hint'
      ? [
          {
            id: session.definition.id,
            target: session.definition.target,
            title: session.definition.title,
            content: session.definition.content,
            placement: session.definition.placement ?? 'auto',
            ...(session.definition.settingsWalk
              ? { data: { settingsWalk: session.definition.settingsWalk } }
              : {}),
          },
        ]
      : (session?.definition.steps.map((step) => ({
          id: step.id,
          target: step.target,
          title: step.title,
          content: step.content,
          ...(step.placement ? { placement: step.placement } : {}),
          ...(step.clickTarget ? { blockTargetInteraction: false } : {}),
          ...(step.buttons ? { buttons: step.buttons } : {}),
          // A settings walk's gear step stays out of the way: no dimming, and
          // Escape or a click elsewhere closes it (Chao, issue 360).
          ...(settingsWalkActive ? { hideOverlay: true, dismissKeyAction: 'close' as const } : {}),
        })) ?? []);

  const handleEvent = (event: EventData) => {
    if (event.type === EVENTS.TARGET_NOT_FOUND) {
      pauseCurrentHint('target-missing');
      return;
    }
    if (
      session?.kind === 'hint' &&
      (event.action === ACTIONS.CLOSE ||
        event.origin === ORIGIN.BUTTON_CLOSE ||
        event.origin === ORIGIN.KEYBOARD)
    ) {
      deferCurrentHint();
      return;
    }
    if (
      session?.kind === 'hint' &&
      (event.action === ACTIONS.NEXT || event.origin === ORIGIN.BUTTON_PRIMARY)
    ) {
      acknowledgeCurrentHint();
      return;
    }
    if (session?.kind === 'hint' && event.type === EVENTS.TOUR_END) {
      // Joyride can normalize the final event to action "update" and clear its
      // origin. The preceding close/next event owns the user intent, so an
      // origin-less tour end must not acknowledge a Contextual Hint.
      return;
    }
    if (
      event.type === EVENTS.TOUR_END ||
      event.status === STATUS.SKIPPED ||
      event.action === ACTIONS.SKIP
    ) {
      // Leaving a settings walk before opening Settings ends it.
      if (
        session?.kind === 'tour' &&
        isSettingsWalkTour(session.definition.id) &&
        !useSettingsDialogStore.getState().open
      ) {
        useSettingsDialogStore.getState().endGuide();
      }
      setTourSession(null);
    }
  };

  // Opening Settings completes the gear step; Settings takes over from there.
  useEffect(
    () =>
      useSettingsDialogStore.subscribe((state, previous) => {
        if (state.open && !previous.open) {
          setTourSession((current) =>
            current && isSettingsWalkTour(current.definition.id) ? null : current,
          );
        }
      }),
    [],
  );

  const modalOpen = modalCount > 0;
  const isHint = session?.kind === 'hint';
  // Turn off hints (and a hint's own action, such as Turn off tabs) walks
  // people to the setting instead of changing it here (issues 358, 359):
  // first the Settings gear, then, inside Settings, the tab and the option,
  // which they change themselves.
  const startSettingsWalk = (guide: SettingsGuide) => {
    useSettingsDialogStore.getState().startGuide(guide);
    setTourSession({ kind: 'tour', definition: settingsWalkTour(guide), started: true });
  };
  const guidanceInteractive = Boolean(session) && !modalOpen;

  useEffect(() => {
    if (!guidanceInteractive || session?.kind !== 'hint' || !userId) return;

    const acknowledgeWithEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.repeat) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('button, input, select, textarea, a[href]'))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      acknowledgeCurrentHint();
    };

    window.addEventListener('keydown', acknowledgeWithEnter, true);
    return () => {
      window.removeEventListener('keydown', acknowledgeWithEnter, true);
    };
  });

  return (
    <GuidanceContext.Provider
      value={{ dispatchContextualHintVisit, startGuidedTour, startSettingsWalk }}
    >
      <SettingsWalkContext.Provider value={startSettingsWalk}>
        {children}
        <div
          ref={setPortalElement}
          aria-hidden={modalOpen}
          inert={modalOpen}
          // Click-through: Joyride's overlay blocks the page itself and leaves
          // the target clickable when a step allows it; index.css keeps the
          // hint card clickable (issue 358).
          className={session ? 'pointer-events-none fixed inset-0 z-[100]' : 'relative z-[100]'}
          data-testid="guidance-portal"
        />
        {session && sessionKey && portalElement ? (
          <GuidancePresentationBoundary key={sessionKey}>
            <Joyride
              run
              continuous
              steps={steps}
              portalElement={portalElement}
              onEvent={handleEvent}
              locale={{ close: 'Not now', last: isHint ? 'Got it' : 'Done' }}
              styles={guidanceStyles}
              tooltipComponent={isHint ? ContextualHintTooltip : undefined}
              options={{
                arrowBase: 22,
                arrowColor: 'var(--vscode-editorWidget-background)',
                arrowSize: 11,
                buttons: isHint ? ['primary'] : ['back', 'skip', 'primary'],
                blockTargetInteraction: true,
                disableFocusTrap: modalOpen,
                dismissKeyAction: isHint ? 'close' : false,
                offset: 14,
                overlayClickAction: false,
                overlayColor:
                  'color-mix(in srgb, var(--vscode-editor-background) 45%, transparent)',
                primaryColor: 'var(--vscode-button-background)',
                scrollDuration: reducedMotion ? 0 : 300,
                skipBeacon: true,
                spotlightPadding: 6,
                spotlightRadius: 14,
                targetWaitTimeout: 3_000,
                textColor: 'var(--vscode-editorWidget-foreground)',
                width: 360,
                zIndex: 1,
              }}
            />
          </GuidancePresentationBoundary>
        ) : null}
      </SettingsWalkContext.Provider>
    </GuidanceContext.Provider>
  );
}
