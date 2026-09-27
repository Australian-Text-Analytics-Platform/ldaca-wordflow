import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnalysisProgress } from './AnalysisProgress';

/** Isolate broken saved output so its request controls remain usable. */
export function AnalysisResultBoundary({
  base,
  analysisId,
  name,
  onError,
  onReset,
  children,
}: {
  base: string;
  analysisId: string | null;
  name: string;
  onError: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const cache = useQueryClient();
  if (!analysisId) return children;
  return (
    <ErrorBoundary
      key={analysisId}
      onError={onError}
      fallbackRender={({ resetError }) => (
        <AnalysisProgress
          name={name}
          error
          message="Could not display saved results. Retry loading them, or use Rerun to rebuild them."
          onRetry={() => {
            void cache.invalidateQueries({
              queryKey: ['native', base, 'analyses', analysisId],
            });
            onReset();
            resetError();
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
