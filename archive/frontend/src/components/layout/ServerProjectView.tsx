import { ProjectPanels } from './ProjectPanels';
import { ProjectControlsView } from './ProjectControlsView';
import { ServerProjectDataTableFeature } from '@/features/project/data-view';
import { ServerProjectGraphFeature } from '@/features/project/graph-view';
export default function ServerProjectView({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <ProjectPanels
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      controls={<ProjectControlsView onToggleCollapse={onToggleCollapse} />}
      graph={<ServerProjectGraphFeature />}
      table={<ServerProjectDataTableFeature />}
    />
  );
}
