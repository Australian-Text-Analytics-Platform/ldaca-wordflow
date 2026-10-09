import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EVENTS,
  ORIGIN,
  type Props as JoyrideProps,
  STATUS,
  type TooltipRenderProps,
} from 'react-joyride';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGuidanceAcknowledgmentsStore } from '../acknowledgmentsStore';
import { useGuidance } from '../GuidanceContext';
import { GuidanceProvider } from '../GuidanceProvider';
import { GuidanceVisitBoundary } from '../GuidanceVisitBoundary';
import { useModalLayerStore } from '../modalLayerStore';
import type { ContextualHintDefinition, GuidedTourDefinition } from '../types';
import { useProgressiveContextualHints } from '../useProgressiveContextualHints';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';

const fixture = vi.hoisted(() => ({
  enabled: true,
  joyrideProps: null as JoyrideProps | null,
  updatePreferences: vi.fn(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/features/preferences/useUserPreferences', () => ({
  useUserPreferences: () => ({ data: { contextual_hints_enabled: fixture.enabled } }),
  useUpdateUserPreferences: () => ({ mutate: fixture.updatePreferences }),
}));

vi.mock('react-joyride', () => ({
  ACTIONS: { CLOSE: 'close', NEXT: 'next', SKIP: 'skip' },
  EVENTS: {
    STEP_AFTER: 'step:after',
    TARGET_NOT_FOUND: 'error:target_not_found',
    TOUR_END: 'tour:end',
  },
  ORIGIN: {
    BUTTON_CLOSE: 'button_close',
    BUTTON_PRIMARY: 'button_primary',
    KEYBOARD: 'keyboard',
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
  Joyride: (props: JoyrideProps) => {
    fixture.joyrideProps = props;
    const TooltipComponent = props.tooltipComponent;
    const finish = (origin: string, action: string) => {
      props.onEvent?.(
        {
          action,
          origin,
          status: 'running',
          type: 'step:after',
        } as Parameters<NonNullable<JoyrideProps['onEvent']>>[0],
        {} as Parameters<NonNullable<JoyrideProps['onEvent']>>[1],
      );
      props.onEvent?.(
        {
          action: 'update',
          origin: null,
          status: 'finished',
          type: 'tour:end',
        } as Parameters<NonNullable<JoyrideProps['onEvent']>>[0],
        {} as Parameters<NonNullable<JoyrideProps['onEvent']>>[1],
      );
    };
    const tooltipProps = {
      backProps: {},
      closeProps: {
        children: 'Not now',
        onClick: () => finish('button_close', 'close'),
      },
      continuous: true,
      controls: {},
      index: 0,
      isLastStep: true,
      primaryProps: {
        children: 'Got it',
        onClick: () => finish('button_primary', 'next'),
      },
      size: 1,
      skipProps: {},
      step: {
        ...props.steps[0],
        buttons: props.options?.buttons ?? ['primary'],
        styles: { ...props.styles, tooltipFooterSpacer: { flex: 1 } },
      },
      tooltipProps: { 'aria-modal': true, role: 'alertdialog' },
    } as unknown as TooltipRenderProps;

    return (
      <div data-testid="joyride">
        {TooltipComponent ? <TooltipComponent {...tooltipProps} /> : null}
      </div>
    );
  },
}));

const hint = (id = 'hint-one', version = 1): ContextualHintDefinition => ({
  id,
  version,
  target: '#target',
  placement: 'auto',
  title: 'Hint title',
  content: 'Hint content',
});

const tour: GuidedTourDefinition = {
  id: 'tour-one',
  steps: [
    { id: 'step-one', target: '#target', content: 'First' },
    { id: 'step-two', target: '#target-two', content: 'Second' },
  ],
};

function Harness() {
  const guidance = useGuidance();
  return (
    <>
      <button type="button" onClick={() => guidance.reachContextualHint('hint-one')}>
        Reach hint
      </button>
      <button type="button" onClick={() => guidance.reachContextualHint('hint-two')}>
        Reach second
      </button>
      <button type="button" onClick={() => guidance.startGuidedTour('tour-one')}>
        Start tour
      </button>
      <div id="target">Target</div>
      <div id="target-two">Second target</div>
    </>
  );
}

function StateMilestoneHarness() {
  useProgressiveContextualHints(['hint-one']);
  return <div id="target">Target</div>;
}

const sequences = { 'data-loader': ['hint-one', 'hint-two'] } as const;

function renderGuidance({
  hints = [hint()],
  tours = [tour],
}: {
  hints?: ContextualHintDefinition[];
  tours?: GuidedTourDefinition[];
} = {}) {
  return render(
    <GuidanceProvider
      contextualHints={hints}
      contextualHintSequences={sequences}
      guidedTours={tours}
    >
      <GuidanceVisitBoundary view="data-loader">
        <Harness />
      </GuidanceVisitBoundary>
    </GuidanceProvider>,
  );
}

describe('GuidanceProvider', () => {
  beforeEach(() => {
    useSettingsDialogStore.setState({ open: false, guide: null });
    fixture.enabled = true;
    fixture.joyrideProps = null;
    fixture.updatePreferences.mockReset();
    useModalLayerStore.setState({ count: 0 });
    useGuidanceAcknowledgmentsStore.setState({ byUser: {} });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('renders no Joyride UI until a registered milestone is reached', () => {
    renderGuidance({ hints: [], tours: [] });
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
  });

  it('restores state-derived milestone registration after Strict Mode effect replay', async () => {
    render(
      <StrictMode>
        <GuidanceProvider
          contextualHints={[hint()]}
          contextualHintSequences={sequences}
          guidedTours={[]}
        >
          <GuidanceVisitBoundary view="data-loader">
            <StateMilestoneHarness />
          </GuidanceVisitBoundary>
        </GuidanceProvider>
      </StrictMode>,
    );

    expect(await screen.findByTestId('joyride')).toBeInTheDocument();
  });

  it('configures a dismissible Contextual Hint that never blocks the page (issue 364)', async () => {
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));

    expect(screen.getByTestId('joyride')).toBeInTheDocument();
    expect(fixture.joyrideProps?.locale).toEqual({ close: 'Not now', last: 'Got it' });
    expect(fixture.joyrideProps?.options).toMatchObject({
      buttons: ['primary'],
      blockTargetInteraction: true,
      dismissKeyAction: 'close',
      overlayClickAction: false,
      targetWaitTimeout: 3_000,
      width: 360,
    });
    expect(fixture.joyrideProps?.steps[0]?.placement).toBe('auto');
    // The hint step itself lets people work: no dimming, target clickable.
    expect(fixture.joyrideProps?.steps[0]).toMatchObject({
      hideOverlay: true,
      blockTargetInteraction: false,
      disableFocusTrap: true,
    });
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(screen.getByText('Esc = Not now · Enter = Got it')).toBeInTheDocument();
  });

  it('removes animated scrolling when reduced motion is requested', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));

    expect(fixture.joyrideProps?.options?.scrollDuration).toBe(0);
  });

  it('acknowledges with Enter, then waits for the next action before the next hint (issue 364)', async () => {
    const user = userEvent.setup();
    renderGuidance({ hints: [hint(), hint('hint-two')] });
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    await user.click(screen.getByRole('button', { name: 'Reach second' }));

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toEqual({
      'hint-one': 1,
    });
    // No chain: people first do what the hint showed.
    await waitFor(() => expect(screen.queryByTestId('joyride')).not.toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(fixture.joyrideProps?.steps[0]?.id).toBe('hint-two'));
  });

  it('counts using a control inside the area a hint points at as Got it (issue 364)', async () => {
    const area = document.createElement('div');
    area.id = 'target-area';
    area.innerHTML = '<p>Choose Preview or Run</p><button type="button">Preview</button>';
    document.body.append(area);
    const user = userEvent.setup();
    renderGuidance({ hints: [{ ...hint(), target: '#target-area' }] });
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    expect(area).toHaveAttribute('data-hint-target', 'look');

    fireEvent.click(screen.getByText('Choose Preview or Run'));
    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toEqual({
      'hint-one': 1,
    });
    area.remove();
  });

  it('counts a click on the button a hint points at as Got it (issue 364)', async () => {
    const button = document.createElement('button');
    button.id = 'target-button';
    document.body.append(button);
    const user = userEvent.setup();
    renderGuidance({ hints: [{ ...hint(), target: '#target-button' }] });
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    expect(button).toHaveAttribute('data-hint-target', 'click');

    fireEvent.click(button);
    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toEqual({
      'hint-one': 1,
    });
    button.remove();
  });

  it('defers the visit without acknowledging when Not now is chosen', async () => {
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toBeUndefined();
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
  });

  it('defers a missing target without acknowledgment', async () => {
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    act(() => {
      fixture.joyrideProps?.onEvent?.(
        { type: EVENTS.TARGET_NOT_FOUND } as Parameters<NonNullable<JoyrideProps['onEvent']>>[0],
        {} as Parameters<NonNullable<JoyrideProps['onEvent']>>[1],
      );
    });

    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toBeUndefined();
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
  });

  it('stores the highest acknowledged version and allows a higher version', async () => {
    const user = userEvent.setup();
    const view = renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toEqual({
      'hint-one': 1,
    });
    view.unmount();
    renderGuidance({ hints: [hint('hint-one', 2)] });
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    expect(screen.getByTestId('joyride')).toBeInTheDocument();
  });

  it('walks to the Settings gear instead of turning hints off (issue 358)', async () => {
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    await user.click(screen.getByRole('button', { name: 'Turn off hints…' }));

    // Nothing is turned off here: people untick the option in Settings.
    expect(fixture.updatePreferences).not.toHaveBeenCalled();
    expect(useSettingsDialogStore.getState().guide).toBe('contextual-hints');
    expect(fixture.joyrideProps?.steps[0]).toMatchObject({
      target: '[data-guidance="settings-button"]',
      blockTargetInteraction: false,
      buttons: ['close'],
    });

    // Clicking the gear opens Settings, which takes over the walk; no hint
    // shows over Settings.
    act(() => {
      useSettingsDialogStore.getState().openSettings();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
    });
    expect(useSettingsDialogStore.getState().guide).toBe('contextual-hints');
    act(() => {
      useSettingsDialogStore.getState().closeSettings();
    });
    expect(useSettingsDialogStore.getState().guide).toBeNull();
    // Hints were left on, so the hint comes back.
    await waitFor(() => {
      expect(fixture.joyrideProps?.steps[0]?.target).toBe('#target');
    });
  });

  it('clears a leftover hint mark when no hint shows (issue 360)', () => {
    const stray = document.createElement('button');
    stray.setAttribute('data-hint-target', 'click');
    document.body.append(stray);
    renderGuidance();
    expect(stray).not.toHaveAttribute('data-hint-target');
    stray.remove();
  });

  it('outlines an area hint still, and removes it with the hint (issue 360)', async () => {
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    // #target is a div, an area to look at: a still outline, not the pulse.
    expect(screen.getByText('Target')).toHaveAttribute('data-hint-target', 'look');
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => {
      expect(screen.getByText('Target')).not.toHaveAttribute('data-hint-target');
    });
  });

  it('outlines the gear without dimming, and a click elsewhere ends the walk (issue 360)', async () => {
    const gear = document.createElement('button');
    gear.setAttribute('data-guidance', 'settings-button');
    document.body.append(gear);
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    await user.click(screen.getByRole('button', { name: 'Turn off hints…' }));

    expect(fixture.joyrideProps?.steps[0]).toMatchObject({
      hideOverlay: true,
      dismissKeyAction: 'close',
    });
    expect(gear).toHaveAttribute('data-walk-target');
    // A press on the gear itself keeps the walk.
    fireEvent.pointerDown(gear);
    expect(useSettingsDialogStore.getState().guide).toBe('contextual-hints');

    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(fixture.joyrideProps?.steps[0]?.target).not.toBe('[data-guidance="settings-button"]');
    });
    expect(useSettingsDialogStore.getState().guide).toBeNull();
    expect(gear).not.toHaveAttribute('data-walk-target');
    gear.remove();
  });

  it('keeps deliberate tours available when Contextual Hints are disabled', async () => {
    fixture.enabled = false;
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start tour' }));
    expect(screen.getByTestId('joyride')).toBeInTheDocument();
    expect(fixture.joyrideProps?.options?.buttons).toEqual(['back', 'skip', 'primary']);
  });

  it('ends an active Contextual Hint without acknowledgment when disabled', async () => {
    const user = userEvent.setup();
    const view = renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    fixture.enabled = false;
    view.rerender(
      <GuidanceProvider
        contextualHints={[hint()]}
        contextualHintSequences={sequences}
        guidedTours={[tour]}
      >
        <GuidanceVisitBoundary view="data-loader">
          <Harness />
        </GuidanceVisitBoundary>
      </GuidanceProvider>,
    );

    await waitFor(() => expect(screen.queryByTestId('joyride')).not.toBeInTheDocument());
    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toBeUndefined();
  });

  it('waits behind an app modal, then resumes the same inert guidance layer', async () => {
    useModalLayerStore.setState({ count: 1 });
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));

    const portal = screen.getByTestId('guidance-portal');
    expect(portal).toHaveAttribute('inert');
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
    act(() => useModalLayerStore.setState({ count: 0 }));
    expect(await screen.findByTestId('joyride')).toBeInTheDocument();
    act(() => useModalLayerStore.setState({ count: 1 }));
    expect(portal).toHaveAttribute('inert');
    expect(fixture.joyrideProps?.options?.disableFocusTrap).toBe(true);
  });

  it('recognizes Escape as a deferral event from Joyride', async () => {
    const user = userEvent.setup();
    renderGuidance();
    await user.click(screen.getByRole('button', { name: 'Reach hint' }));
    act(() => {
      fixture.joyrideProps?.onEvent?.(
        {
          origin: ORIGIN.KEYBOARD,
          status: STATUS.FINISHED,
          type: EVENTS.TOUR_END,
        } as Parameters<NonNullable<JoyrideProps['onEvent']>>[0],
        {} as Parameters<NonNullable<JoyrideProps['onEvent']>>[1],
      );
    });
    expect(screen.queryByTestId('joyride')).not.toBeInTheDocument();
    expect(useGuidanceAcknowledgmentsStore.getState().byUser['user-1']).toBeUndefined();
  });
});
