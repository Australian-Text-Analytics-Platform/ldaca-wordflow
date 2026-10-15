import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { objectRef, type DataTarget, type ObjectRef } from '@/features/project/objects';
import { createContext, use, useEffect, useId, useRef } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import type { ToolId } from '../toolIds';
import type { NodeAddRejection } from './nodeInputs/nodeInputsCore';

export const ToolInputScope = createContext<{ base: string; tool: ToolId; active: boolean } | null>(
  null,
);
export const DATA_BLOCK_TRANSFER = 'application/x-wordflow-data-block';
interface Destination {
  id: string;
  base: string;
  tool: ToolId;
  label: string;
  add: (targets: ObjectRef[]) => NodeAddRejection[];
}
interface Selection {
  base: string;
  tool: ToolId;
  targets: ObjectRef[];
}
const report = (rejections: NodeAddRejection[]) => {
  if (rejections.length) toast.warning(rejections.map((item) => item.reason).join('; '));
};
export const useInputDestinations = create<{
  destinations: Destination[];
  selection: Selection | null;
  add: (base: string, tool: ToolId, targets: DataTarget[]) => void;
  drop: (id: string, transfer: string) => void;
}>((set, get) => ({
  destinations: [],
  selection: null,
  add: (base, tool, targets) => {
    const choices = get().destinations.filter((item) => item.base === base && item.tool === tool);
    const references = targets.map(objectRef);
    if (choices.length === 1) report(choices[0]!.add(references));
    else if (choices.length > 1) set({ selection: { base, tool, targets: references } });
  },
  drop: (id, transfer) => {
    let value: unknown;
    try {
      value = JSON.parse(transfer);
    } catch {
      return;
    }
    if (!value || typeof value !== 'object' || !('base' in value) || !('target' in value)) return;
    const target = value.target;
    if (
      !target ||
      typeof target !== 'object' ||
      !('schema' in target) ||
      !('name' in target) ||
      typeof target.schema !== 'string' ||
      typeof target.name !== 'string'
    )
      return;
    const destination = get().destinations.find(
      (item) => item.id === id && item.base === value.base,
    );
    if (destination) report(destination.add([{ schema: target.schema, name: target.name }]));
  },
}));
export function useInputDestination(label: string, add: Destination['add'], disabled: boolean) {
  const scope = use(ToolInputScope);
  const id = useId();
  const latest = useRef(add);
  useEffect(() => {
    latest.current = add;
  }, [add]);
  const base = scope?.base,
    tool = scope?.tool,
    active = scope?.active;
  useEffect(() => {
    if (base === undefined || !tool || !active || disabled) return;
    const destination = {
      id,
      base,
      tool,
      label,
      add: (targets: ObjectRef[]) => latest.current(targets),
    };
    useInputDestinations.setState((state) => ({
      destinations: [...state.destinations, destination],
    }));
    return () => {
      useInputDestinations.setState((state) => ({
        destinations: state.destinations.filter((item) => item.id !== id),
      }));
    };
  }, [id, base, tool, active, disabled, label]);
  return id;
}
export function InputDestinationChooser({ base, tool }: { base: string; tool: ToolId }) {
  const { selection, destinations } = useInputDestinations();
  const choices = destinations.filter((item) => item.base === base && item.tool === tool);
  const current = selection?.base === base && selection.tool === tool;
  useEffect(() => {
    if (selection && (!current || !choices.length))
      useInputDestinations.setState({ selection: null });
  }, [selection, current, choices.length]);
  return (
    <Dialog
      open={Boolean(current && choices.length)}
      onOpenChange={(open) => {
        if (!open) useInputDestinations.setState({ selection: null });
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to input</DialogTitle>
        </DialogHeader>
        {choices.map((item) => (
          <Button
            key={item.id}
            onClick={() => {
              const live = useInputDestinations.getState();
              if (live.selection && live.destinations.some((target) => target.id === item.id))
                report(item.add(live.selection.targets));
              useInputDestinations.setState({ selection: null });
            }}
          >
            {item.label}
          </Button>
        ))}
      </DialogContent>
    </Dialog>
  );
}
