import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type DetailsDialogContent, useErrorDetailsStore } from '@/stores/errorDetailsStore';
import { useUIStore } from '@/stores/uiStore';

const EXPLANATION =
  'These details help the Wordflow developers find the problem. To report it, copy them into the feedback form.';

const ACTION_BUTTON = 'rounded-sm border border-surface-border px-2 py-0.5 hover:bg-list-hover';

/** The technical text with Copy and Send feedback, shared by both layouts. */
function DetailsBody({
  technical,
  onFeedback,
}: {
  technical: string;
  onFeedback: (() => void) | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(technical);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <pre className="mt-1 max-h-60 overflow-auto rounded-sm border border-surface-border bg-panel p-2 font-mono text-badge whitespace-pre-wrap wrap-break-word text-foreground select-text">
        {technical}
      </pre>
      <div className="mt-2 flex gap-2 text-label-secondary">
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={() => {
            void copy();
          }}
        >
          {copied ? 'Copied' : 'Copy details'}
        </button>
        {onFeedback ? (
          <button type="button" className={ACTION_BUTTON} onClick={onFeedback}>
            Send feedback
          </button>
        ) : null}
      </div>
    </>
  );
}

/**
 * A "Details" link for a toast that opens the shared Details dialog.
 * Toasts measure their height once and capture the pointer for
 * swipe-to-dismiss, so they cannot hold an expanding panel, and they may time
 * out while the details are being read.
 */
export function DetailsDialogButton(props: DetailsDialogContent) {
  const show = useErrorDetailsStore((state) => state.show);
  return (
    <button
      type="button"
      className="mt-1 flex items-center gap-1 text-label-secondary text-description underline underline-offset-2 hover:text-foreground"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={() => {
        show(props);
      }}
    >
      Details
    </button>
  );
}

/**
 * The "Details" control under an error message (issue 205): the technical
 * text for the developers, with a way to copy it and open the feedback form.
 *
 * `inline` expands in place (errors shown in a tab or panel). `dialog` opens
 * the shared Error details dialog: toasts measure their height once and
 * capture the pointer for swipe-to-dismiss, so they cannot hold an expanding
 * panel, and they may time out while the details are being read.
 */
export function ErrorDetails({
  technical,
  variant = 'inline',
  label = 'Details',
  feedback = true,
}: {
  technical: string;
  variant?: 'inline' | 'dialog';
  /** The toggle's text, for example "Technical details" on startup screens. */
  label?: string;
  /** Offer Send feedback; off where the screen already has the button. */
  feedback?: boolean;
}) {
  const openFeedback = useUIStore((state) => state.openFeedback);
  const [open, setOpen] = useState(false);

  if (variant === 'dialog') {
    return (
      <DetailsDialogButton
        text={technical}
        title="Error details"
        explanation={EXPLANATION}
        feedback
      />
    );
  }

  return (
    <div className="mt-1 text-label-secondary">
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-description hover:text-foreground"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        {label}
      </button>
      {open ? (
        <div>
          <p className="mt-1 text-description">{EXPLANATION}</p>
          <DetailsBody technical={technical} onFeedback={feedback ? openFeedback : null} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hosts the Details dialog that toasts open (issue 205).
 * Rendered once by GlobalHosts.
 */
export function ErrorDetailsHost() {
  const details = useErrorDetailsStore((state) => state.details);
  const close = useErrorDetailsStore((state) => state.close);
  const openFeedback = useUIStore((state) => state.openFeedback);
  return (
    <Dialog
      open={details !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{details?.title ?? 'Details'}</DialogTitle>
          <DialogDescription>{details?.explanation ?? ''}</DialogDescription>
        </DialogHeader>
        {details ? (
          <DetailsBody
            technical={details.text}
            onFeedback={
              details.feedback
                ? () => {
                    close();
                    openFeedback();
                  }
                : null
            }
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
