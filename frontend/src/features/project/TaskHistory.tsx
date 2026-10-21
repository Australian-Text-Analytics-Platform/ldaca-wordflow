import { useState, type ComponentProps } from 'react';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TaskCentre } from './TaskCentre';

export function TaskHistory(props: ComponentProps<typeof TaskCentre>) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Task history">
              <Archive data-icon="inline-start" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Task history</TooltipContent>
      </Tooltip>
      <DialogContent className="flex max-h-[80dvh] w-[calc(100%-2rem)] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Task history</DialogTitle>
          <DialogDescription>
            All task types and statuses retained for this project session.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <TaskCentre
            {...props}
            showSucceeded
            openTab={
              props.openTab &&
              ((tab) => {
                props.openTab?.(tab);
                setOpen(false);
              })
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
