import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DownloadDialog } from '../common/components/DownloadControl';
import { CHART_FORMATS } from '../common/chartExport';
import type { DownloadFormat } from './frequencyExport';

interface FrequencyDownloadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  kind: 'table' | 'chart';
  hasStopwords: boolean;
  onExport: (format: DownloadFormat, includeStopwords: boolean) => Promise<string | null>;
  onError: (error: unknown) => void;
}

export function FrequencyDownload(props: FrequencyDownloadProps) {
  return props.open ? (
    <FrequencyDownloadOptions key={`${props.kind}:${props.label}`} {...props} />
  ) : null;
}
function FrequencyDownloadOptions(props: FrequencyDownloadProps) {
  const id = useId();
  const [includeStopwords, setIncludeStopwords] = useState(true);
  const { kind, hasStopwords } = props;
  return (
    <DownloadDialog<DownloadFormat>
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Export ${props.label}`}
      actionLabel="Export"
      formatLabel="Format"
      description={
        kind === 'chart'
          ? 'Export the displayed word cloud. Include stopwords to download both files as a ZIP.'
          : 'Export all matching rows, including rows outside the displayed limit. Include stopwords to download both files as a ZIP.'
      }
      formats={
        kind === 'chart'
          ? CHART_FORMATS
          : [
              { value: 'csv', label: 'CSV' },
              { value: 'markdown', label: 'Markdown' },
            ]
      }
      defaultFormat={kind === 'chart' ? 'png' : 'csv'}
      onError={props.onError}
      onExport={(format) => props.onExport(format, hasStopwords && includeStopwords)}
    >
      {(pending) =>
        hasStopwords && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-stopwords`}
              checked={includeStopwords}
              disabled={pending}
              onCheckedChange={(value) => {
                setIncludeStopwords(value === true);
              }}
            />
            <Label htmlFor={`${id}-stopwords`}>Include stopwords (.txt)</Label>
          </div>
        )
      }
    </DownloadDialog>
  );
}
