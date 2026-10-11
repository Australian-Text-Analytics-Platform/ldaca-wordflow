import { WorkflowGuidance } from '@/features/guidance/WorkflowGuidance';
import { ToolInputScope } from '@/features/tools/common/inputDestinations';
import { ALL_TOOLS, type ToolId } from '@/features/tools/toolIds';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { ProjectNode } from './api';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import type { ObjectRef } from './objects';
import type { NativeTask } from './tasksApi';
const Preprocessing = lazy(() => import('@/features/tools/preprocessing/DataPreprocessingFeature'));
const Frequency = lazy(() => import('@/features/tools/token-frequency/TokenFrequencyFeature'));
const Concordance = lazy(() => import('@/features/tools/concordance/ConcordanceFeature'));
const Quotation = lazy(() => import('@/features/tools/quotation/QuotationFeature'));
const Plots = lazy(() => import('@/features/tools/plots/PlotsFeature'));
const Topic = lazy(() => import('@/features/tools/topic-modeling/TopicModelingFeature'));
const Annotation = lazy(() => import('@/features/tools/annotation/AnnotationFeature'));
const Export = lazy(() => import('@/features/tools/export/ExportFeature'));
interface Context {
  base: string;
  nodes: ProjectNode[];
  tasks: NativeTask[];
  active: boolean;
  editing?: boolean;
  onCancel: (id: string) => void;
  onToolChange: (tool: ToolId) => void;
  exportSelection: ObjectRef[];
}
const renderers = {
  'data-loader': (p) => (
    <DataLoaderWorkspace
      base={p.base}
      active={p.active}
      onActivate={() => p.onToolChange('data-loader')}
    />
  ),
  filter: (p) => <Preprocessing base={p.base} nodes={p.nodes} active={p.active} />,
  'token-frequency': (p) => (
    <Frequency {...p} onOpenConcordance={() => p.onToolChange('concordance')} />
  ),
  concordance: (p) => <Concordance {...p} />,
  quotation: (p) => <Quotation {...p} />,
  plots: (p) => <Plots {...p} />,
  'topic-modeling': (p) => <Topic {...p} />,
  annotation: (p) => <Annotation {...p} />,
  export: (p) => (
    <Export base={p.base} nodes={p.nodes} active={p.active} graphSelection={p.exportSelection} />
  ),
} satisfies Record<ToolId, (context: Context) => ReactNode>;
export const isTabbedTool = (tool: ToolId) => !['data-loader', 'filter', 'export'].includes(tool);
export function ToolHost({
  activeTool,
  ...context
}: Omit<Context, 'active'> & { activeTool: ToolId }) {
  const [visited, setVisited] = useState(() => new Set<ToolId>(['data-loader', activeTool]));
  if (!visited.has(activeTool)) setVisited(new Set([...visited, activeTool]));
  return (
    <>
      {ALL_TOOLS.filter((tool) => visited.has(tool) || tool === activeTool).map((tool) => (
        <div
          key={tool}
          data-guidance-tool={tool}
          hidden={tool !== activeTool}
          className={
            isTabbedTool(tool) ? 'h-full min-h-0 w-full min-w-0' : 'w-full min-h-0 min-w-0'
          }
        >
          <ToolInputScope value={{ base: context.base, tool, active: tool === activeTool }}>
            <Suspense fallback={<p>Loading…</p>}>
              {renderers[tool]({ ...context, active: tool === activeTool })}
            </Suspense>
          </ToolInputScope>
        </div>
      ))}
      <WorkflowGuidance
        tool={activeTool}
        blocked={Boolean(
          context.editing ||
          context.tasks.some((task) => ['running', 'queued', 'cancelling'].includes(task.state)),
        )}
      />
    </>
  );
}
