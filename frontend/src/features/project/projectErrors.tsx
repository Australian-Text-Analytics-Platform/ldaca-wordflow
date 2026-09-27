import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recordSessionError } from '@/features/diagnostics/sessionErrors';

export function reportProjectError(
  error: unknown,
  title = 'Operation failed',
  id?: string,
  taskId?: string,
) {
  // Accepted task failures belong to the window-level task observer.
  if (error && typeof error === 'object' && 'taskId' in error && error.taskId) return;
  const entry = recordSessionError(error, title, 'notification', taskId);
  const details = entry.details ?? entry.message;
  const toastId = id ?? entry.id;
  const show = (expanded: boolean) => {
    toast.error(title, {
      id: toastId,
      duration: Infinity,
      description: (
        <div className="min-w-0 max-w-full">
          <p className="mb-1 line-clamp-3 whitespace-pre-wrap break-words">{entry.message}</p>
          <button
            type="button"
            aria-expanded={expanded}
            className="cursor-pointer text-foreground underline"
            onClick={() => {
              show(!expanded);
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-body-secondary">
              {details}
            </pre>
          )}
        </div>
      ),
    });
  };
  show(false);
}

/** Cache callbacks report each failed request once, outside the document layout. */
export function createProjectQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (
          query.meta?.reportError === false ||
          // A Data View may close while its final read is settling (for example on deletion).
          (['schema', 'rows'].includes(String(query.queryKey[2])) && !query.isActive()) ||
          (error instanceof Error && error.name === 'AbortError')
        )
          return;
        reportProjectError(
          error,
          'Could not load data',
          typeof query.meta?.errorToastId === 'string'
            ? query.meta.errorToastId
            : `project-query-${query.queryHash}`,
        );
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.reportError !== false) reportProjectError(error);
      },
    }),
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
  });
}
