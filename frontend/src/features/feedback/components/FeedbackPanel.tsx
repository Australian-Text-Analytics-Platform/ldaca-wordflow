import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SURVEY_BASE_URL, buildSurveyUrl, type FeedbackContext } from '../feedbackContext';

interface FeedbackPanelProps {
  context: FeedbackContext | null;
  onClose: () => void;
}

/** Feedback presentation for the current project application. */
export function FeedbackPanelView({ context, onClose }: FeedbackPanelProps) {
  const surveyUrl = context ? buildSurveyUrl(SURVEY_BASE_URL, context) : '';

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
