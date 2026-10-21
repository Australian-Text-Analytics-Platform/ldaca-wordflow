import { MAX_ANNOTATION_CONCURRENCY } from '../../annotationTabSettings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AnnotationRunAllSettingsProps {
  maxRetriesPerBatch: number;
  onMaxRetriesPerBatchCommit: (value: number) => void;
  batchSize: number;
  onBatchSizeCommit: (value: number) => void;
  processingMode: 'reprocess_all' | 'fill_missing';
  onProcessingModeChange: (value: 'reprocess_all' | 'fill_missing') => void;
  maxConcurrency: number;
  /** The selected provider's default: 2 for Custom, 10 otherwise. */
  defaultMaxConcurrency: number;
  onMaxConcurrencyCommit: (value: number) => void;
  disabled?: boolean;
}

/** Wordflow-owned batching and write behavior shared by every Annotation provider. */
export function AnnotationRunAllSettings({
  maxRetriesPerBatch,
  onMaxRetriesPerBatchCommit,
  batchSize,
  onBatchSizeCommit,
  processingMode,
  onProcessingModeChange,
  maxConcurrency,
  defaultMaxConcurrency,
  onMaxConcurrencyCommit,
  disabled,
}: AnnotationRunAllSettingsProps) {
  return (
    <section aria-labelledby="annotation-run-all-settings" className="space-y-4">
      <div className="space-y-0.5">
        <h3 id="annotation-run-all-settings" className="text-body font-medium">
          Run controls
        </h3>
        <p className="text-label-secondary text-description">
          These settings apply to every provider.
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-body font-medium">Which rows to annotate</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Label className="flex cursor-pointer items-center gap-2 font-normal">
            <input
              type="radio"
              name="annotation-ai-processing-mode"
              value="fill_missing"
              checked={processingMode === 'fill_missing'}
              disabled={disabled}
              className="size-4 accent-primary"
              onChange={() => {
                onProcessingModeChange('fill_missing');
              }}
            />
            Only rows without an annotation
          </Label>
          <Label className="flex cursor-pointer items-center gap-2 font-normal">
            <input
              type="radio"
              name="annotation-ai-processing-mode"
              value="reprocess_all"
              checked={processingMode === 'reprocess_all'}
              disabled={disabled}
              className="size-4 accent-primary"
              onChange={() => {
                onProcessingModeChange('reprocess_all');
              }}
            />
            Annotate all rows again
          </Label>
        </div>
        <p className="text-label-secondary text-description">
          Only rows without an annotation (the default) keeps the annotations you already have and
          sends just the rest. Annotating all rows again replaces the annotation column.
        </p>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="annotation-ai-batch-size">Rows per request</Label>
        <Input
          key={`annotation-ai-batch-size-${String(batchSize)}`}
          id="annotation-ai-batch-size"
          type="number"
          min={1}
          max={100}
          step={1}
          defaultValue={String(batchSize)}
          disabled={disabled}
          className="w-28"
          onBlur={(event) => {
            const parsed = Number(event.target.value);
            const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 20;
            onBatchSizeCommit(Math.min(100, Math.max(1, safe)));
          }}
        />
        <p className="text-label-secondary text-description">
          How many rows go to the AI model in each request (default 20, up to 100).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="annotation-ai-max-concurrency">Requests at once</Label>
        <Input
          key={`annotation-ai-max-concurrency-${String(maxConcurrency)}`}
          id="annotation-ai-max-concurrency"
          type="number"
          min={1}
          max={MAX_ANNOTATION_CONCURRENCY}
          step={1}
          defaultValue={String(maxConcurrency)}
          disabled={disabled}
          className="w-28"
          onBlur={(event) => {
            const parsed = Number(event.target.value);
            const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : defaultMaxConcurrency;
            onMaxConcurrencyCommit(Math.min(MAX_ANNOTATION_CONCURRENCY, Math.max(1, safe)));
          }}
        />
        <p className="text-label-secondary text-description">
          How many requests Run sends at the same time (default {defaultMaxConcurrency} for this
          provider). Match a local server's own limit.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="annotation-ai-max-retries-per-batch">Retries if a request fails</Label>
        <Input
          key={`annotation-ai-max-retries-per-batch-${String(maxRetriesPerBatch)}`}
          id="annotation-ai-max-retries-per-batch"
          type="number"
          min={0}
          max={10}
          step={1}
          defaultValue={String(maxRetriesPerBatch)}
          disabled={disabled}
          className="w-28"
          onBlur={(event) => {
            const parsed = Number(event.target.value);
            const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 2;
            onMaxRetriesPerBatchCommit(Math.min(10, Math.max(0, safe)));
          }}
        />
        <p className="text-label-secondary text-description">
          How many more times to try a request that fails (default 2, so 3 tries in all). 0 means no
          retries.
        </p>
      </div>
    </section>
  );
}
