import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface SampleCollection {
  id: string;
  name: string;
  description?: string;
  total_size_bytes: number;
  installed?: boolean;
  recommended_for?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  concordance: 'Concordance',
  'token-frequency': 'Token Frequency',
  preprocessing: 'Preprocessing',
  'data-loader': 'Data Loader',
  'topic-modeling': 'Topic Modelling',
  'sequential-analysis': 'Sequential Analysis',
};

/**
 * Formats sample-data collection sizes in the import dialog.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shared sample catalogue rows; each host owns its import and file access. */
export function SampleCollectionList<T extends SampleCollection>({
  collections,
  checked,
  onToggle,
  renderReadme,
  renderFiles,
  disabled = false,
}: {
  collections: T[];
  checked: (collection: T) => boolean | 'indeterminate';
  onToggle: (id: string) => void;
  renderReadme?: (collection: T) => ReactNode;
  renderFiles?: (collection: T) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="divide-y">
      {collections.map((col) => (
        <Collapsible key={col.id} className="flex flex-col gap-1.5 py-3">
          <div className="grid grid-cols-[2rem_1rem_minmax(0,1fr)_auto] items-start gap-2">
            {renderFiles && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="group shrink-0"
                  aria-label={`Show files in ${col.name}`}
                >
                  <ChevronRight className="group-data-[state=open]:rotate-90" />
                </Button>
              </CollapsibleTrigger>
            )}
            <Checkbox
              id={`sdc-${col.id}`}
              className="mt-1"
              checked={checked(col)}
              disabled={disabled || col.installed}
              onCheckedChange={() => {
                onToggle(col.id);
              }}
            />
            <label
              htmlFor={`sdc-${col.id}`}
              className="min-w-0 flex-1 text-body font-medium leading-snug cursor-pointer select-none"
            >
              {col.name}
            </label>
            {renderReadme?.(col)}
            <span className="text-label-secondary text-description whitespace-nowrap">
              {formatBytes(col.total_size_bytes)}
            </span>
            {col.installed && <Badge variant="secondary">Imported</Badge>}
          </div>
          {col.description && (
            <p
              className={cn(
                'text-label-secondary text-description',
                renderFiles ? 'pl-16' : 'pl-6',
              )}
            >
              {col.description}
            </p>
          )}
          {(col.recommended_for?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 pl-6">
              {col.recommended_for?.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-label-secondary">
                  {TOOL_LABELS[tool] ?? tool}
                </Badge>
              ))}
            </div>
          )}
          {renderFiles && (
            <CollapsibleContent className="pl-16 pt-2">{renderFiles(col)}</CollapsibleContent>
          )}
        </Collapsible>
      ))}
    </div>
  );
}
