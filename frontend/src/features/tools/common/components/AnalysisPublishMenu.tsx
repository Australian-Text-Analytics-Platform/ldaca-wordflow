import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
export function AnalysisPublishMenu({
  disabled,
  matchesLabel,
  onSelect,
}: {
  disabled: boolean;
  matchesLabel: string;
  onSelect: (mode: 'matches' | 'documents') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Add to Project <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={() => {
            onSelect('matches');
          }}
        >
          {matchesLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onSelect('documents');
          }}
        >
          Documents
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
