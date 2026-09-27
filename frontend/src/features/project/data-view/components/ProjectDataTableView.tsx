import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectDataHeader } from './ProjectDataHeader';
import { ProjectTable } from './ProjectTable';
import type { ProjectDataTableViewModel } from './projectTableModel';

const LoadingState = () => (
  <div className="space-y-4 p-6">
    <div className="flex items-center gap-2 text-body text-description">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Loading data block…</span>
    </div>
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="space-y-3 rounded-lg border border-dashed border-surface-border/50 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 gap-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="flex h-full items-center justify-center p-6 text-center">
    <div>
      <h3 className="text-body font-semibold text-foreground">No Data Preview Open</h3>
      <p className="mt-1 text-label-secondary text-description">
        Use a Data Block’s Preview data button to view its data.
      </p>
    </div>
  </div>
);

export function ProjectDataTableView({ model }: { model: ProjectDataTableViewModel }) {
  const { selectedNode, header, table, loading, nodeActions } = model;

  if (!selectedNode) {
    return <EmptyState />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <ProjectDataHeader
          info={header}
          undoTitle={nodeActions.undoTitle}
          redoTitle={nodeActions.redoTitle}
          onRename={nodeActions.onRename}
          onUndo={nodeActions.onUndo}
          onClose={nodeActions.onClose}
        />
        <div className="min-h-0 flex-1">
          {loading.nodeData ? <LoadingState /> : <ProjectTable key={selectedNode.id} {...table} />}
        </div>
      </div>
    </div>
  );
}
