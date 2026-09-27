import type { NodeProps, Node as ReactFlowNode } from '@xyflow/react';
import { downloadDataBlocks } from '../../common/dataBlockExport';
import { useProjectData } from '@/features/project/common/hooks/useProjectData';
import { CustomNodeView, type CustomNodeData } from './CustomNodeView';
function CustomNode(props: NodeProps<ReactFlowNode<CustomNodeData>>) {
  const { currentProjectId, currentProject } = useProjectData();
  return (
    <CustomNodeView
      {...props}
      onExport={(format) => downloadDataBlocks({ projectId: currentProjectId ?? '', projectName: currentProject?.name ?? '', dataBlocks: [{ id: props.id, name: props.data.node.name }], format })}
    />
  );
}

export default CustomNode;
