import { NodeInputPointerCarrier } from '@/components/layout/NodeInputPointerCarrier';
import { useUIStore } from '@/stores';
import { useProjectData } from './hooks/useProjectData';

export function ServerProjectNodeInputPointerCarrier() {
  const { currentProjectId, nodes } = useProjectData();
  const view = useUIStore((state) => state.currentView);
  return <NodeInputPointerCarrier scopeId={currentProjectId} view={view} nodes={nodes} />;
}
