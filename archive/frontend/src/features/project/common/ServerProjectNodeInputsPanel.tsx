import {
  NodeInputsPanel as Presentation,
  type NodeInputsPanelProps,
} from '@/features/views/common/components/NodeInputsPanel';
import { useProjectData } from './hooks/useProjectData';
import { useUIStore } from '@/stores';
import { useNodeInputRequestsStore } from '@/stores/nodeInputRequestsStore';
export function NodeInputsPanel(props: NodeInputsPanelProps) {
  const { currentProjectId } = useProjectData();
  const currentView = useUIStore((state) => state.currentView);
  const pending = useNodeInputRequestsStore((state) => state.pendingRequests);
  const consume = useNodeInputRequestsStore((state) => state.consume);
  return (
    <Presentation
      {...props}
      pendingInputRequest={pending.findLast(
        (request) => request.scopeId === currentProjectId && request.view === currentView,
      )}
      consumeInputRequest={consume}
    />
  );
}
export type {
  NodeInputsPanelProps,
  NodeInputColumnAddonArgs,
} from '@/features/views/common/components/NodeInputsPanel';
