import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildCombinations, type BuildCombination } from '../hooks/buildExpressionModel';
import type { BuildChain } from '../operations';

export function CombinationPopover({
  value,
  chains,
  onChange,
  children,
  open,
  onOpenChange,
  footer,
}: {
  value?: BuildCombination | null;
  chains: (BuildChain | null)[];
  onChange: (value: BuildCombination) => void;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  footer?: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [separator, setSeparator] = useState(' ');
  const [search, setSearch] = useState('');
  const changeOpen = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
    if (next) {
      setSeparator(value?.separator ?? ' ');
      setSearch('');
    }
  };
  return (
    <Popover open={open ?? localOpen} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
        <Input
          aria-label="Search functions"
          placeholder="Search functions…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <label className="space-y-1 text-body">
          Text separator
          <Input
            aria-label="Separator"
            value={separator}
            onChange={(event) => {
              setSeparator(event.target.value);
            }}
            placeholder="Empty — join directly"
          />
        </label>
        <div className="max-h-64 overflow-y-auto">
          {buildCombinations
            .filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
            .map((option) => {
              const available = chains.every((chain) => chain !== null) && option.accepts(chains);
              return (
                <Button
                  key={option.kind}
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                  disabled={!available}
                  title={option.description}
                  onClick={() => {
                    onChange({ kind: option.kind, separator });
                    changeOpen(false);
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
        </div>
        {footer}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            changeOpen(false);
          }}
        >
          Cancel
        </Button>
      </PopoverContent>
    </Popover>
  );
}
