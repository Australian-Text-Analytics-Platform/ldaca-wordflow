import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hints, type Hints } from 'driver.js/hints';
import 'driver.js/dist/hints.css';
import './guidance.css';
import { useIsMutating } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patchPreferences, usePreferences } from '@/features/preferences/preferences';
import type { ToolId } from '@/features/tools/toolIds';
import { useModalLayerStore } from './modalLayerStore';
import { nextHint, type HintStage, type WorkflowHint } from './registry';
import { useServer } from '@/features/server/context';
function visible(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return (
    !element.closest('[hidden], [aria-hidden="true"], [data-state="inactive"]') &&
    box.width > 0 &&
    box.height > 0 &&
    box.top < window.innerHeight &&
    box.bottom > 0 &&
    box.left < window.innerWidth &&
    box.right > 0
  );
}
/** One nonmodal hint for the active visit. Retained hidden tools never register eligible targets. */
export function WorkflowGuidance({ tool, blocked }: { tool: ToolId; blocked: boolean }) {
  return <GuidanceVisit key={tool} tool={tool} blocked={blocked} />;
}
function GuidanceVisit({ tool, blocked }: { tool: ToolId; blocked: boolean }) {
  const hasFileLibrary = useServer() !== null;
  const { guidance } = usePreferences();
  const modals = useModalLayerStore((state) => state.count);
  const mutations = useIsMutating();
  const [paused, setPaused] = useState(false);
  const [targets, setTargets] = useState<
    Partial<Record<HintStage, { anchor: HTMLElement; owner: HTMLElement }>>
  >({});
  const [waitingForAction, setWaitingForAction] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<'manual' | 'ai'>('manual');
  useEffect(() => {
    let frame = 0;
    const scan = () => {
      frame = 0;
      const root = document.querySelector<HTMLElement>(`[data-guidance-tool="${tool}"]`);
      setAnnotationMode(
        root?.querySelector('[data-guidance-annotation-mode="ai"]') ? 'ai' : 'manual',
      );
      const next: typeof targets = {};
      const candidates = [
        ...Array.from(document.querySelectorAll<HTMLElement>(`[data-guidance-for="${tool}"]`)),
        ...Array.from(root?.querySelectorAll<HTMLElement>('[data-guidance-stage]') ?? []),
      ];
      candidates.forEach((element) => {
        const stage = element.dataset.guidanceStage as HintStage;
        if (
          !next[stage] &&
          visible(element) &&
          !element.matches(':disabled, [aria-disabled="true"]') &&
          !element.closest('fieldset:disabled, [disabled], [aria-disabled="true"]')
        ) {
          const heading = element.querySelector<HTMLElement>('h2, h3');
          const header = heading?.closest<HTMLElement>('.flex.justify-between');
          next[stage] = {
            anchor: header && element.contains(header) ? header : (heading ?? element),
            owner: element,
          };
        }
      });
      setTargets((old) =>
        Object.keys(next).length === Object.keys(old).length &&
        Object.entries(next).every(
          ([key, element]) =>
            old[key as HintStage]?.anchor === element.anchor &&
            old[key as HintStage]?.owner === element.owner,
        )
          ? old
          : next,
      );
      const focused = document.activeElement;
      const activeEditor =
        root?.matches('[data-guidance-editing="true"]') ||
        Array.from(
          root?.querySelectorAll<HTMLElement>('[data-guidance-editing="true"]') ?? [],
        ).some(visible);
      const pendingWork = Array.from(
        root?.querySelectorAll<HTMLElement>('[data-guidance-pending="true"]') ?? [],
      ).some(visible);
      const openDialog = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'),
      ).some(visible);
      setEditing(
        Boolean(
          activeEditor ||
          pendingWork ||
          openDialog ||
          (focused instanceof HTMLElement &&
            visible(focused) &&
            focused.matches('input, textarea, [contenteditable="true"], [role="textbox"]')),
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'hidden',
        'disabled',
        'aria-disabled',
        'aria-hidden',
        'data-guidance-for',
        'data-guidance-stage',
        'data-guidance-editing',
        'data-guidance-pending',
        'data-guidance-annotation-mode',
        'data-state',
      ],
    });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    scan();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, [tool]);
  const hint = nextHint(
    tool,
    new Set(Object.keys(targets) as HintStage[]),
    guidance.acknowledgments,
    paused,
    guidance.enabled,
    annotationMode,
    hasFileLibrary,
  );
  const target = hint ? targets[hint.stage]?.anchor : undefined;
  const owner = hint ? targets[hint.stage]?.owner : undefined;
  const shown = Boolean(
    hint && target && !blocked && !modals && !mutations && !editing && !saving && !waitingForAction,
  );
  const save = (patch: Parameters<typeof patchPreferences>[0]) => {
    setWaitingForAction(true);
    setSaving(true);
    void patchPreferences(patch)
      .catch(() => setPaused(true))
      .finally(() => setSaving(false));
  };
  const acknowledgeTarget = useEffectEvent(() => {
    if (hint) save({ guidance: { acknowledge: { id: hint.id, version: hint.version } } });
  });
  useEffect(() => {
    // A focused field temporarily hides the popover; its actual edit still
    // acknowledges the same workflow target.
    if (
      !hint ||
      !owner ||
      !guidance.enabled ||
      paused ||
      waitingForAction ||
      saving ||
      blocked ||
      modals
    )
      return;
    const used = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      const control = element?.closest(
        'button, a[href], summary, select, [role="button"], [role="combobox"], input, textarea',
      );
      if (
        !control ||
        !owner.contains(control) ||
        control.matches(':disabled, [aria-disabled="true"]')
      )
        return;
      acknowledgeTarget();
    };
    document.addEventListener('click', used, true);
    document.addEventListener('change', used, true);
    document.addEventListener('input', used, true);
    return () => {
      document.removeEventListener('click', used, true);
      document.removeEventListener('change', used, true);
      document.removeEventListener('input', used, true);
    };
  }, [hint, owner, guidance.enabled, paused, waitingForAction, saving, blocked, modals]);
  useEffect(() => {
    if (!waitingForAction) return;
    let frame = 0;
    const advance = () => {
      if (!frame) frame = requestAnimationFrame(() => setWaitingForAction(false));
    };
    const key = (event: KeyboardEvent) => {
      if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) advance();
    };
    document.addEventListener('click', advance, true);
    document.addEventListener('keydown', key, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', advance, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [waitingForAction]);
  if (!shown || !hint || !target) return null;
  return (
    <GuidancePopover hint={hint} target={target} defer={() => setPaused(true)}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="workflow-hint-title" className="font-semibold">
          {hint.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label="Dismiss hint"
          onClick={() => setPaused(true)}
        >
          <X aria-hidden />
        </Button>
      </div>
      <p className="mt-2 text-description leading-relaxed">{hint.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            save({ guidance: { acknowledge: { id: hint.id, version: hint.version } } })
          }
        >
          Got it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPaused(true)}>
          Not now
        </Button>
        <Button size="sm" variant="ghost" onClick={() => save({ guidance: { enabled: false } })}>
          Disable hints
        </Button>
      </div>
    </GuidancePopover>
  );
}

/** Driver.js owns placement, viewport updates and dismissal; React owns Wordflow's content. */
function GuidancePopover({
  hint,
  target,
  defer,
  children,
}: {
  hint: WorkflowHint;
  target: HTMLElement;
  defer: () => void;
  children: React.ReactNode;
}) {
  const instance = useRef<Hints | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const onDefer = useEffectEvent(defer);
  // Disconnect Driver observers during commit, before portal removal can look like dismissal.
  useLayoutEffect(() => {
    let popup: HTMLElement | undefined;
    let beacon: HTMLElement | null = null;
    let hiddenByViewport = false;
    const beside = target.getBoundingClientRect().right + 344 <= window.innerWidth;
    const manager = hints({
      overlay: false,
      beacon: {
        animate: false,
        side: beside ? 'right' : 'bottom',
        align: beside ? 'start' : 'center',
        className: 'wordflow-guidance-beacon',
      },
      hints: [
        {
          id: hint.id,
          element: target,
          popover: {
            side: beside ? 'right' : 'bottom',
            align: beside ? 'start' : 'center',
            popoverClass: 'wordflow-guidance',
            showButton: false,
            onPopoverRender: ({ wrapper, description }) => {
              popup = wrapper;
              wrapper.dataset.guidancePopup = hint.id;
              wrapper.setAttribute('role', 'complementary');
              wrapper.setAttribute('aria-labelledby', 'workflow-hint-title');
              wrapper.removeAttribute('aria-describedby');
              description.replaceChildren();
              description.style.display = 'block';
              setContent(description);
            },
          },
        },
      ],
    });
    instance.current = manager;
    target.setAttribute('data-guidance-highlighted', 'true');
    const observer = new MutationObserver((records) => {
      if (!popup || popup.isConnected) return;
      // Driver closes offscreen hints without a dismissal hook. Its beacon tracks visibility.
      const hidden = beacon?.classList.contains('driver-hint-hidden');
      hiddenByViewport ||=
        Boolean(hidden) ||
        records.some(
          (record) => record.target === beacon && record.oldValue?.includes('driver-hint-hidden'),
        );
      if (hidden) return;
      if (hiddenByViewport) {
        hiddenByViewport = false;
        manager.open(hint.id);
      } else onDefer();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => manager.refresh());
    });
    resize.observe(target);
    // Finish the navigation click before installing Driver.js's outside-click listener.
    const openFrame = requestAnimationFrame(() => {
      manager.show();
      beacon = document.querySelector<HTMLElement>('.wordflow-guidance-beacon');
      if (beacon)
        observer.observe(beacon, {
          attributes: true,
          attributeFilter: ['class'],
          attributeOldValue: true,
        });
      // React mounts the buttons afterward, leaving no initial focusable controls.
      manager.open(hint.id);
      if (popup) resize.observe(popup);
    });
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(openFrame);
      target.removeAttribute('data-guidance-highlighted');
      manager.hide();
      instance.current = null;
    };
  }, [hint.id, target]);
  useLayoutEffect(() => {
    if (content) instance.current?.refresh();
  }, [content]);
  return (
    content &&
    createPortal(
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            defer();
          }
        }}
      >
        {children}
      </div>,
      content,
    )
  );
}
