import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ResetSortButton({ sorted, onReset }: { sorted: boolean; onReset: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Reset sort"
      title="Reset sort and return to page one"
      disabled={!sorted}
      onClick={onReset}
    >
      <RotateCcw aria-hidden className="size-4" />
    </Button>
  );
}
