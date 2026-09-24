import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StopWordsEnabledSwitch } from '@/features/views/common/components/StopWordsEnabledSwitch';
import { StopWordsLanguageSelect } from '@/features/views/common/components/StopWordsLanguageSelect';
import type { StopWordListSource } from '@/features/views/common/utils/stopWordListSources';
import { formatStopWords, parseStopWordsText } from '@/features/views/common/utils/stopWords';

interface TopicModelingStopWordsControlProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  savedWords: string[];
  workspaceId: string | null;
  nodeId: string | null;
  column: string | null;
  onSavedWordsChange: (words: string[]) => Promise<void>;
  /** Other tabs' saved stop-word lists offered for copying. */
  sources?: StopWordListSource[];
}

/**
 * Edits and applies the active Topic Tab's saved stop words without changing
 * the immutable Result. The shared language dropdown appends default stop
 * words to the saved list; the switch only controls whether that list
 * participates in the current Result projection.
 */
export function TopicModelingStopWordsControl({
  enabled,
  onEnabledChange,
  savedWords,
  workspaceId,
  nodeId,
  column,
  onSavedWordsChange,
  sources = [],
}: TopicModelingStopWordsControlProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState('');
  const [isSavingEditor, setIsSavingEditor] = useState(false);
  const normalizedEditorWordCount = parseStopWordsText(editorDraft).length;

  const handleEditorOpenChange = (open: boolean) => {
    if (isSavingEditor) return;
    if (open) setEditorDraft(formatStopWords(savedWords));
    setEditorOpen(open);
  };

  const saveEditor = async () => {
    setIsSavingEditor(true);
    try {
      await onSavedWordsChange(parseStopWordsText(editorDraft));
      setEditorOpen(false);
    } catch {
      // Keep the draft open. The shared mutation presents the retryable error.
    } finally {
      setIsSavingEditor(false);
    }
  };

  return (
    <>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <StopWordsEnabledSwitch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          label="Filter stop words"
        />
        <StopWordsLanguageSelect
          words={savedWords}
          onWordsChange={onSavedWordsChange}
          workspaceId={workspaceId}
          nodeId={nodeId}
          column={column}
          sources={sources}
          disabled={isSavingEditor}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Edit stop words"
              disabled={isSavingEditor}
              onClick={() => {
                handleEditorOpenChange(true);
              }}
            >
              <Pencil data-icon="inline-start" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit stop words</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={editorOpen} onOpenChange={handleEditorOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit stop words</DialogTitle>
            <DialogDescription>
              Enter words separated by commas or new lines. Saving replaces this Tab&apos;s saved
              list without changing the Topic Result.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="topic-modeling-stop-words">Stop words</Label>
            <Textarea
              id="topic-modeling-stop-words"
              rows={8}
              value={editorDraft}
              disabled={isSavingEditor}
              placeholder="the, and, of"
              onChange={(event) => {
                setEditorDraft(event.target.value);
              }}
            />
            <p className="text-label-secondary text-description">
              {String(normalizedEditorWordCount)} normalized words
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSavingEditor}
              onClick={() => {
                handleEditorOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSavingEditor}
              onClick={() => {
                void saveEditor();
              }}
            >
              {isSavingEditor ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
