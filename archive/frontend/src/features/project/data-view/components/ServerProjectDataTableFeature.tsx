import {
  ProjectDataTableView,
  type ProjectDataTableFeatureProps,
} from './ProjectDataTableView';
import { useProjectDataTable } from '../hooks/useProjectDataTable';
export type { ProjectDataTableFeatureProps } from './ProjectDataTableView';
export function ServerProjectDataTableFeature(_props: ProjectDataTableFeatureProps) {
  return <ProjectDataTableView model={useProjectDataTable()} />;
}
