import { ProjectGraphView, type ProjectGraphFeatureProps } from './ProjectGraphView';
import { useProjectActions } from '@/features/project/common/hooks/useProjectActions';
import { useProjectData } from '@/features/project/common/hooks/useProjectData';
import { useProjectSelection } from '@/features/project/common/hooks/useProjectSelection';
import { useProjectGraph } from '../hooks/useProjectGraph';
export type { ProjectGraphFeatureProps } from './ProjectGraphView';
export function ServerProjectGraphFeature({ fallback }: ProjectGraphFeatureProps) {
  const graph = useProjectGraph();
  const { projectGraph } = useProjectData();
  const { deleteNode, clearSelection } = useProjectActions();
  const { selectedNodeIds } = useProjectSelection();
  return (
    <ProjectGraphView
      graph={graph}
      fallback={fallback}
      nodes={projectGraph?.nodes ?? []}
      selectedNodeIds={selectedNodeIds}
      deleteNode={deleteNode}
      clearSelection={clearSelection}
    />
  );
}
