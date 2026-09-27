import { useEffect } from 'react';
import { toast } from 'sonner';
import { useNodeInputRequestsStore } from '@/stores/nodeInputRequestsStore';
import type { NodeAddRejection } from './nodeInputsCore';

/** One input area consumes additions immediately; multiple areas keep them carried for placement. */
export function useNodeInputRequests({
  scopeId,
  tool,
  addNodes,
  enabled = true,
  deferPlacement = false,
}: {
  scopeId: string | null;
  tool: string;
  addNodes: (ids: string[]) => NodeAddRejection[];
  enabled?: boolean;
  deferPlacement?: boolean;
}) {
  const pending = useNodeInputRequestsStore((state) => state.pendingRequests);
  const consume = useNodeInputRequestsStore((state) => state.consume);
  useEffect(() => {
    if (!enabled || deferPlacement || scopeId === null) return;
    // Read current ownership so StrictMode or a second effect cannot replay a consumed request.
    const matching = useNodeInputRequestsStore
      .getState()
      .pendingRequests.filter((request) => request.scopeId === scopeId && request.tool === tool);
    if (!matching.length) return;
    const rejections = addNodes(matching.map((request) => request.nodeId));
    if (rejections.length)
      toast.warning(
        rejections.length === 1
          ? `Couldn't add node: ${rejections[0]?.reason ?? ''}`
          : `Couldn't add ${String(rejections.length)} nodes (already added or full).`,
      );
    matching.forEach((request) => {
      consume(request.id);
    });
  }, [scopeId, tool, enabled, deferPlacement, pending, addNodes, consume]);

  return {
    pendingInputRequest: enabled
      ? pending.findLast((request) => request.scopeId === scopeId && request.tool === tool)
      : undefined,
    consumeInputRequest: consume,
  };
}
