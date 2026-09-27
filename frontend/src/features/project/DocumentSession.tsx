import { ServerControls } from '@/features/server/ServerControls';
import { useAnnotationState } from '@/features/tools/annotation/annotationState';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DesktopNavigationHeaderView } from '@/components/layout/DesktopNavigationHeaderView';
import { Button } from '@/components/ui/button';
import { isMacOSDesktop } from '@/lib/isMacOSDesktop';
import { isTauri } from '@/lib/isTauri';
import NativeSettings from './NativeSettings';
import ProjectView, { type ProjectTool } from './ProjectView';
import { listTabs, projectStatus } from './api';
import { reportProjectError } from './projectErrors';
import { useFrequencyState } from '@/features/tools/token-frequency/frequencyState';
import { useTopicState } from '@/features/tools/topic-modeling/topicState';
import { useQuotationState } from '@/features/tools/quotation/quotationState';
import { useConcordanceState } from '@/features/tools/concordance/concordanceState';
import { usePlotMode, usePlotState, plotScope, plotLabels } from '@/features/tools/plots/plotState';
import { TOOL_DEFINITIONS } from '@/features/tools/toolRegistry';

/** The native host initializes and owns the document, including Save and Close. */
export default function DocumentSession({ base }: { base: string }) {
  const cache = useQueryClient();
  const [activeTool, setActiveTool] = useState<ProjectTool>('data-loader');
  const annotationTabId = useAnnotationState((s) => s.active[base]);
  const frequencyTabId = useFrequencyState((state) => state.active[base]);
  const concordanceTabId = useConcordanceState((state) => state.active[base]);
  const topicTabId = useTopicState((s) => s.active[base]);
  const quotationTabId = useQuotationState((s) => s.active[base]);
  const plotMode = usePlotMode((s) => s.modes[base] ?? 'trends');
  const plotTabId = usePlotState((s) => s.active[plotScope(base, plotMode)]);
  const kind =
    activeTool === 'annotation'
      ? 'annotation'
      : activeTool === 'topic-modeling'
        ? 'topic-modeling'
        : activeTool === 'plots'
          ? plotMode
          : activeTool === 'quotation'
            ? 'quotation'
            : activeTool === 'concordance'
              ? 'concordance'
              : 'frequency';
  const activeTabId =
    activeTool === 'annotation'
      ? annotationTabId
      : activeTool === 'topic-modeling'
        ? topicTabId
        : activeTool === 'plots'
          ? plotTabId
          : activeTool === 'quotation'
            ? quotationTabId
            : activeTool === 'concordance'
              ? concordanceTabId
              : frequencyTabId;
  const tabs = useQuery({
    queryKey: ['native', base, 'tabs', kind],
    queryFn: ({ signal }) => listTabs(base, signal, kind),
    // Observe saved names; the Frequency feature owns loading its tabs.
    enabled: false,
  });
  const activeTab = tabs.data?.find((tab) => tab.id === activeTabId) ?? tabs.data?.[0];
  const section = TOOL_DEFINITIONS.find((tool) => tool.id === activeTool);
  const project = useQuery({
    queryKey: ['native', base, 'project'],
    queryFn: ({ signal }) => projectStatus(base, signal),
  });
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const stops: (() => void)[] = [];
    const retain = (stop: () => void) => {
      if (disposed) stop();
      else stops.push(stop);
    };
    void getCurrentWindow()
      .listen('project-changed', () => {
        void cache.invalidateQueries({ queryKey: ['native', base, 'project'] });
      })
      .then(retain)
      .catch(reportProjectError);
    void getCurrentWindow()
      .listen<{ message: string }>('project-error', ({ payload }) => {
        reportProjectError(payload);
      })
      .then(retain)
      .catch(reportProjectError);
    return () => {
      disposed = true;
      stops.forEach((stop) => {
        stop();
      });
    };
  }, [base, cache]);
  return (
    <div className="relative flex h-full flex-col text-foreground">
      <DesktopNavigationHeaderView
        projectName={project.data?.title ?? 'Untitled'}
        location={
          project.data && section
            ? [
                section.label,
                ...(activeTool === 'plots' ? [plotLabels[plotMode]] : []),
                ...((activeTool === 'token-frequency' ||
                  activeTool === 'concordance' ||
                  activeTool === 'quotation' ||
                  activeTool === 'annotation' ||
                  activeTool === 'topic-modeling' ||
                  activeTool === 'plots') &&
                activeTab
                  ? [activeTab.name]
                  : []),
              ]
            : []
        }
        hasNativeTrafficLights={isMacOSDesktop()}
        tools={
          <>
            <ServerControls projectBase={base} />
            <NativeSettings />
          </>
        }
      />
      {project.error && (
        <div className="p-6">
          <Button
            onClick={() => {
              void project.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {project.isPending && (
        <p className="p-6" role="status">
          Opening project…
        </p>
      )}
      {project.data && (
        <ProjectView base={base} activeTool={activeTool} setActiveTool={setActiveTool} />
      )}
    </div>
  );
}
