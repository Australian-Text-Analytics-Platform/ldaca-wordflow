import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import HelpIcon from '@/components/help/HelpIcon';
import { Button } from '@/components/ui/button';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  BRIEF_MAX_WORDS,
  type CodeDesignerSettings,
  countWords,
  DESIGNER_MAX_CLASSES,
} from '../codebookDesigner';

interface CodeDesignerBriefProps {
  settings: CodeDesignerSettings;
  onSettingsChange: (patch: Partial<CodeDesignerSettings>) => void;
  /** Why the designer can't start yet, apart from the brief itself. */
  blockedReason?: string;
  disabled?: boolean;
  onDesign: () => void;
}

/**
 * The brief for the AI Code Designer, above Task context in the Edit
 * codebook window (Chao, 15 Nov 2026). Kept with the tab, never sent with
 * annotation. Once the codes are changed by hand and saved, the brief greys
 * out and the designer waits until it is edited; it can still be copied.
 */
export function CodeDesignerBrief({
  settings,
  onSettingsChange,
  blockedReason,
  disabled = false,
  onDesign,
}: CodeDesignerBriefProps) {
  const [maxClassesDraft, setMaxClassesDraft] = useState<string | null>(null);
  const words = countWords(settings.brief);
  const tooLong = words > BRIEF_MAX_WORDS;
  const reason = settings.briefStale
    ? 'The codes were changed by hand. Edit the brief to design again.'
    : !settings.brief.trim()
      ? 'Write a brief first.'
      : tooLong
        ? `Shorten the brief to ${String(BRIEF_MAX_WORDS)} words or fewer.`
        : blockedReason;

  return (
    <div className="space-y-1.5" data-testid="code-designer-brief">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="codebook-brief">
          Brief for the AI Code Designer{' '}
          <span className="font-normal text-description">(optional)</span>
        </Label>
        <HelpIcon
          targetKey="analysis.annotation.code-designer"
          label="About the AI Code Designer"
          tooltip="Let an AI model draft a first codebook from your brief and a sample of your texts."
        />
      </div>
      <Textarea
        id="codebook-brief"
        value={settings.brief}
        rows={3}
        placeholder="What do you want to find out? For example: how candidates talk about jobs, as promises or as warnings about cuts."
        aria-describedby="codebook-brief-note"
        data-stale={settings.briefStale || undefined}
        className={cn('min-h-16 resize-y', settings.briefStale && 'bg-panel text-description')}
        onChange={(event) => {
          // Editing the brief makes it the brief for the next design again.
          onSettingsChange({ brief: event.target.value, briefStale: false });
        }}
      />
      <p id="codebook-brief-note" className="text-label-secondary text-description">
        {settings.briefStale
          ? 'The codes were changed by hand after this brief, so it no longer describes them. You can still copy it; edit it to design again.'
          : 'What the coding is for: a research question, hypothesis or aim. Used only by the AI Code Designer, never sent with annotation.'}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={cn(
            'text-label-secondary tabular-nums',
            tooLong ? 'text-error' : 'text-description',
          )}
          data-testid="codebook-brief-words"
        >
          {String(words)} / {String(BRIEF_MAX_WORDS)} words
        </span>
        <div className="flex items-center gap-2">
          <Label htmlFor="codebook-designer-max-classes" className="font-normal">
            Maximum classes
          </Label>
          <Input
            id="codebook-designer-max-classes"
            type="number"
            min={DESIGNER_MAX_CLASSES.min}
            max={DESIGNER_MAX_CLASSES.max}
            className="h-8 w-16"
            value={maxClassesDraft ?? String(settings.maxClasses)}
            onChange={(event) => {
              setMaxClassesDraft(event.target.value);
            }}
            onBlur={() => {
              if (maxClassesDraft === null) return;
              const value = Number(maxClassesDraft);
              if (Number.isFinite(value) && maxClassesDraft.trim() !== '') {
                onSettingsChange({
                  maxClasses: Math.min(
                    DESIGNER_MAX_CLASSES.max,
                    Math.max(DESIGNER_MAX_CLASSES.min, Math.round(value)),
                  ),
                });
              }
              setMaxClassesDraft(null);
            }}
          />
          <span className="text-label-secondary text-description">plus “Other”</span>
        </div>
        <DisabledReasonTooltip reason={reason}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || reason !== undefined}
            onClick={onDesign}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            AI Code Designer
          </Button>
        </DisabledReasonTooltip>
      </div>
    </div>
  );
}
