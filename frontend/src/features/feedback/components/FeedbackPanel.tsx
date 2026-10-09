import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SURVEY_BASE_URL, buildSurveyUrl, type FeedbackContext } from '../feedbackContext';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@/lib/isTauri';
import { OperationError } from '@/features/project/OperationError';

interface FeedbackPanelProps {
  context: FeedbackContext | null;
  onClose: () => void;
}

/** Feedback presentation for the current project application. */
export function FeedbackPanelView({ context, onClose }: FeedbackPanelProps) {
  const surveyUrl = context ? buildSurveyUrl(SURVEY_BASE_URL, context) : '';
  const native = isTauri();
  const opening = useRef<{
    context: FeedbackContext;
    attempt: number;
    promise: Promise<void>;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<unknown>();
  useEffect(() => {
    if (!native || !context) return;
    let disposed = false;
    if (opening.current?.context !== context || opening.current.attempt !== attempt) {
      setFailure(undefined);
      opening.current = {
        context,
        attempt,
        promise: invoke<void>('open_feedback', { url: surveyUrl }),
      };
    }
    void opening.current.promise.then(
      () => {
        if (!disposed) onClose();
      },
      (error) => {
        if (!disposed) setFailure(error);
      },
    );
    return () => {
      disposed = true;
    };
  }, [native, context, surveyUrl, attempt, onClose]);

  if (native)
    return failure === undefined ? null : (
      <OperationError
        title="Could not open feedback"
        error={failure}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );

  return (
    <Dialog
      open={context !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="w-full max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Share ideas, report issues, or suggest improvements.
          </DialogDescription>
        </DialogHeader>
        {surveyUrl ? (
          <iframe src={surveyUrl} title="Feedback survey" className="h-[80vh] w-full border-0" />
        ) : (
          <div className="h-[80vh] w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
