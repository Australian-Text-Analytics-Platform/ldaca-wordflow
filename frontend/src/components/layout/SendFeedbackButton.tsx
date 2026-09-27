import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/uiStore';

/**
 * Opens the feedback form from a startup screen, so a user stuck before the
 * workspace loads can still report what happened (issue 207).
 */
export function SendFeedbackButton({ variant = 'outline' }: { variant?: 'default' | 'outline' }) {
  const openFeedback = useUIStore((state) => state.openFeedback);
  return (
    <Button type="button" variant={variant} onClick={openFeedback}>
      Send feedback
    </Button>
  );
}
