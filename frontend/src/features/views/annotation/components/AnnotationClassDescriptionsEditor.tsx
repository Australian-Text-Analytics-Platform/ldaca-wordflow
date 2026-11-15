import { useState } from 'react';
import type { AnnotationClassDescriptionRow } from '@/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import {
  normalizeClassDescriptionRows,
  useAnnotationClassDescriptions,
} from '../hooks/useAnnotationClassDescriptions';
import { toastError } from '@/lib/toastError';
import { cn } from '@/lib/utils';
import {
  checkCodebook,
  codebookSuggestions,
  codeKey,
  hasCodebookProblems,
  mergedDescription,
  resolveCode,
  withoutRepeatedRows,
} from '../codebookChecks';
import {
  isTaskContextCode,
  TASK_CONTEXT_CODE,
  TASK_CONTEXT_MAX_CHARS,
  withTaskContext,
} from '../taskContext';
import type { AnnotationProviderConfigurationView } from '@/features/provider-credentials/providerCredentialsStore';
import { type CodeDesignerSettings, codebookSignature } from '../codebookDesigner';
import { codebookDraftKey, useCodebookDraftStore } from '../codebookDraftStore';
import { CodeDesignerBrief } from './CodeDesignerBrief';
import { CodebookDesignerDialog } from './CodebookDesignerDialog';

/** What the Edit codebook window needs from its Annotation tab for the AI Code Designer. */
interface CodebookDesignerContext {
  tabId: string;
  settings: CodeDesignerSettings;
  onSettingsChange: (patch: Partial<CodeDesignerSettings>) => void;
  /** The tab's Annotation Data Block and text column; null until chosen. */
  source: { nodeId: string; name: string; textColumn: string } | null;
  configurations: AnnotationProviderConfigurationView[];
  providerModels: Record<string, string>;
  /** The tab's AI provider and model, the designer's starting choice. */
  fallbackProviderId: string | null;
  fallbackModel: string;
}

// Compact card shows class-name badges; extras collapse into a "+N more" badge
// so the card stays tight while the full list lives in the Edit dialog.
const CLASS_NAME_PREVIEW_LIMIT = 20;

/** Suggestions for repeated codes or shared descriptions (issue 389). */
function CodebookSuggestions({ suggestions, hint }: { suggestions: string[]; hint?: string }) {
  if (suggestions.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-1.5 rounded-md border border-warning bg-warning-background px-3 py-2 text-label-secondary text-warning"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-1">
        {suggestions.map((suggestion) => (
          <p key={suggestion}>{suggestion}</p>
        ))}
        {hint ? <p>{hint}</p> : null}
      </div>
    </div>
  );
}

interface AnnotationClassDescriptionsEditorProps {
  workspaceId: string | null;
  nodeId: string | null;
  classColumn: string | null;
  descriptionColumn: string | null;
  /** Omitted where there is no Annotation tab around the codebook. */
  designer?: CodebookDesignerContext;
}

/**
 * Compact class summary plus an Edit dialog for the selected Annotation class node.
 *
 * Used by: AnnotationFeature's Codebook card because users need to see
 * the configured classes at a glance and edit them (add/rename/delete) before
 * running annotation, without the descriptions cluttering the card.
 *
 * Flow: fetch the selected two-column payload through
 * useAnnotationClassDescriptions, render the class names as compact badges, and
 * expose an Edit dialog with draft rows. Save commits the complete row set
 * through one Data Block edit and therefore creates exactly one Undo
 * checkpoint. Unsaved changes, typed or from the AI Code Designer, are kept
 * for the tab until Save or a confirmed discard (Chao, 15 Nov 2026): closing
 * the window keeps them, and Cancel asks first.
 */
export function AnnotationClassDescriptionsEditor({
  workspaceId,
  nodeId,
  classColumn,
  descriptionColumn,
  designer,
}: AnnotationClassDescriptionsEditorProps) {
  const { saveAnnotationClasses } = useWorkspaceActions();
  const draftKey = codebookDraftKey([
    workspaceId,
    designer?.tabId,
    nodeId,
    classColumn,
    descriptionColumn,
  ]);
  const draft = useCodebookDraftStore((state) => state.drafts[draftKey]);
  const setDraft = useCodebookDraftStore((state) => state.setDraft);
  const clearDraft = useCodebookDraftStore((state) => state.clearDraft);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const classDescriptions = useAnnotationClassDescriptions({
    workspaceId,
    nodeId,
    classColumn,
    descriptionColumn,
  });

  const savedRows = classDescriptions.rows;
  const editorRows = draft?.rows ?? normalizeClassDescriptionRows(savedRows);
  const savedTaskContext = classDescriptions.taskContext.trim();
  const editorTaskContext = draft?.taskContext ?? classDescriptions.taskContext;
  const savedSignature = codebookSignature(savedRows);
  // Changes worth keeping: different codes or a different Task context.
  const dirty =
    draft !== undefined &&
    (codebookSignature(draft.rows) !== savedSignature ||
      draft.taskContext.trim() !== savedTaskContext);
  const isAiDraft =
    dirty &&
    draft.designedSignature !== null &&
    codebookSignature(draft.rows) === draft.designedSignature;
  const writeDraft = (patch: { rows?: AnnotationClassDescriptionRow[]; taskContext?: string }) => {
    setDraft(draftKey, {
      rows: patch.rows ?? editorRows,
      taskContext: patch.taskContext ?? editorTaskContext,
      designedSignature: draft?.designedSignature ?? null,
    });
  };
  // Compact card display: the saved codes, each name paired with its (trimmed)
  // description so each chip can show its description in a hover tooltip; capped
  // with a "+N more" badge. Chips without a description render as plain badges.
  const classChips = savedRows
    .map((row) => ({
      name: row.class.trim(),
      description: row.description.trim(),
    }))
    .filter((chip) => chip.name.length > 0);
  const visibleClassChips = classChips.slice(0, CLASS_NAME_PREVIEW_LIMIT);
  const savedCheck = checkCodebook(savedRows);
  const draftCheck = checkCodebook(editorRows);
  const hiddenClassCount = classChips.length - visibleClassChips.length;

  const updateDraftCell = (rowIndex: number, field: 'class' | 'description', value: string) => {
    writeDraft({
      rows: editorRows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row)),
    });
  };

  const handleAddClass = () => {
    writeDraft({ rows: [...editorRows, { class: '', description: '' }] });
  };

  // Remove the row from the draft; Save persists the remaining classes.
  const handleDeleteClass = (rowIndex: number) => {
    writeDraft({ rows: editorRows.filter((_, index) => index !== rowIndex) });
  };

  // Closing (×, Esc, a click outside) keeps unsaved changes for later.
  const handleOpenChange = (open: boolean) => {
    if (!open && !dirty) clearDraft(draftKey);
    setIsEditOpen(open);
  };

  const handleCancel = () => {
    if (dirty) setDiscardOpen(true);
    else handleOpenChange(false);
  };

  const namedCodeCount = editorRows.filter((row) => row.class.trim() !== '').length;
  const startDesigner = () => {
    // Replacing codes asks first, and suggests a fresh codebook instead.
    if (namedCodeCount > 0) setOverwriteOpen(true);
    else setDesignerOpen(true);
  };

  const handleSave = async () => {
    if (!nodeId || !classColumn || !descriptionColumn) return;
    const normalized = normalizeClassDescriptionRows(editorRows).map((row) => ({
      class: row.class.trim(),
      description: row.description,
    }));
    if (normalized.some((row) => row.class.length === 0)) {
      toast.error('Every annotation code needs a name.');
      return;
    }
    if (normalized.some((row) => isTaskContextCode(row.class))) {
      toast.error(`“${TASK_CONTEXT_CODE}” is reserved for the Task context. Rename that code.`);
      return;
    }
    const uniqueNames = new Set(normalized.map((row) => codeKey(row.class)));
    if (uniqueNames.size !== normalized.length) {
      toast.error('Each code can appear only once. Follow the suggestion below the codes.');
      return;
    }
    setIsSaving(true);
    try {
      await saveAnnotationClasses(
        nodeId,
        classColumn,
        descriptionColumn,
        withTaskContext(normalized, editorTaskContext),
      );
      if (designer) {
        // Saving the AI draft as it came keeps the brief in step; codes
        // changed by hand mean the brief no longer describes them.
        const nextSignature = codebookSignature(normalized);
        if (draft?.designedSignature && nextSignature === draft.designedSignature) {
          designer.onSettingsChange({ designedSignature: nextSignature, briefStale: false });
        } else if (
          nextSignature !== savedSignature &&
          nextSignature !== designer.settings.designedSignature
        ) {
          designer.onSettingsChange({ briefStale: true });
        }
      }
      clearDraft(draftKey);
      setIsEditOpen(false);
      toast.success('Codebook saved.');
    } catch (error) {
      toastError(error, "Couldn't save the codebook.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!nodeId) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-surface-border px-4 py-3 text-body text-description">
        Select a Codebook Data Block to edit codes.
      </div>
    );
  }

  if (classDescriptions.query.isError) {
    return (
      <div className="mt-4 rounded-md border border-error/30 bg-error/5 px-4 py-3 text-body text-error">
        Could not load the codebook.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-body font-semibold">Codes</h3>
        <Dialog open={isEditOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!classDescriptions.canLoad || classDescriptions.query.isLoading}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-2xl"
            onOpenAutoFocus={(event) => {
              // Don't drop a cursor into the first class input on open: that
              // would persist a redundant no-op save the moment the user clicks
              // Add/Delete (the blur fires before the click).
              event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Edit codebook
                {dirty ? (
                  <Badge variant="outline" data-testid="codebook-unsaved-badge">
                    {isAiDraft ? 'AI draft, not saved' : 'Unsaved changes'}
                  </Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                Add, rename, or remove annotation codes and their descriptions.
              </DialogDescription>
            </DialogHeader>
            {designer ? (
              <CodeDesignerBrief
                settings={designer.settings}
                onSettingsChange={designer.onSettingsChange}
                disabled={isSaving}
                blockedReason={
                  designer.source
                    ? undefined
                    : 'Choose an Annotation Data Block and its text column first.'
                }
                onDesign={startDesigner}
              />
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="codebook-task-context">
                Task context <span className="font-normal text-description">(optional)</span>
              </Label>
              <Textarea
                id="codebook-task-context"
                value={editorTaskContext}
                rows={3}
                maxLength={TASK_CONTEXT_MAX_CHARS}
                placeholder="What the texts are and what the codes are for, for example: Tweets by Australian politicians during the 2025 election campaign."
                className="min-h-16 resize-y"
                onChange={(event) => {
                  writeDraft({ taskContext: event.target.value });
                }}
              />
              <p className="text-label-secondary text-description">
                Saved with this codebook and sent to the AI with every request, after the prompt.
              </p>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {editorRows.length === 0 ? (
                <p className="rounded-md border border-dashed border-surface-border px-4 py-6 text-center text-body text-description">
                  No codes yet. Use “Add code” to create one.
                </p>
              ) : (
                editorRows.map((row, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Input
                      aria-label={`Code ${String(index + 1)}`}
                      value={row.class}
                      placeholder="Code"
                      data-codebook-problem={draftCheck.rowsToMark.has(index) || undefined}
                      className={cn('w-1/3', draftCheck.rowsToMark.has(index) && 'border-warning')}
                      disabled={false}
                      onChange={(event) => {
                        updateDraftCell(index, 'class', event.target.value);
                      }}
                    />
                    <Textarea
                      aria-label={`Description ${String(index + 1)}`}
                      value={row.description}
                      rows={2}
                      placeholder="Description"
                      disabled={false}
                      data-codebook-problem={draftCheck.rowsToMark.has(index) || undefined}
                      className={cn(
                        'min-h-9 flex-1 resize-y',
                        draftCheck.rowsToMark.has(index) && 'border-warning',
                      )}
                      onChange={(event) => {
                        updateDraftCell(index, 'description', event.target.value);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete code ${String(index + 1)}`}
                      className="shrink-0 text-description hover:text-error"
                      onClick={() => {
                        handleDeleteClass(index);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            {hasCodebookProblems(draftCheck) ? (
              <div className="max-h-[30vh] space-y-2 overflow-y-auto pr-1">
                <CodebookSuggestions suggestions={codebookSuggestions(editorRows, draftCheck)} />
                {draftCheck.repeatedRows.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => {
                      writeDraft({ rows: withoutRepeatedRows(editorRows) });
                    }}
                  >
                    Remove repeated rows
                  </Button>
                ) : null}
                {draftCheck.codesWithSeveralDescriptions.map((code) => (
                  <fieldset
                    key={code.key}
                    className="space-y-1.5 rounded-md border border-surface-border px-3 pb-2"
                  >
                    <legend className="px-1 text-label-secondary font-medium">
                      Description for “{code.name}”
                    </legend>
                    {code.descriptions.map((description, index) => (
                      <div key={description} className="flex items-start justify-between gap-2">
                        <p className="text-body break-words">
                          {description || (
                            <span className="text-description">(no description)</span>
                          )}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          aria-label={`Use description ${String(index + 1)} for ${code.name}`}
                          disabled={isSaving}
                          onClick={() => {
                            writeDraft({ rows: resolveCode(editorRows, code.key, description) });
                          }}
                        >
                          Use this
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Merge the descriptions for ${code.name}`}
                      disabled={isSaving}
                      onClick={() => {
                        writeDraft({
                          rows: resolveCode(
                            editorRows,
                            code.key,
                            mergedDescription(code.descriptions),
                          ),
                        });
                      }}
                    >
                      Merge descriptions
                    </Button>
                  </fieldset>
                ))}
              </div>
            ) : null}
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!classDescriptions.canLoad || editorRows.length >= 200 || isSaving}
                onClick={handleAddClass}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Add code
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!classDescriptions.canLoad || isSaving}
                  onClick={() => {
                    void handleSave();
                  }}
                >
                  {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAiDraft ? 'Discard the AI draft?' : 'Discard unsaved changes?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isAiDraft
                ? "The AI Code Designer's draft hasn't been saved. Discarding it can't be undone."
                : "Your changes to the codes and Task context haven't been saved. Discarding them can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearDraft(draftKey);
                setIsEditOpen(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={overwriteOpen} onOpenChange={setOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the codes in this codebook?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI Code Designer replaces the {String(namedCodeCount)}{' '}
              {namedCodeCount === 1 ? 'code' : 'codes'} in this window with a new draft. Nothing is
              saved until you choose Save, and Undo in the Data Editor brings back the saved
              codebook. To keep these codes, cancel and start a fresh codebook with Create new.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDesignerOpen(true);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {designer?.source && workspaceId ? (
        <CodebookDesignerDialog
          open={designerOpen}
          onOpenChange={setDesignerOpen}
          settings={designer.settings}
          onSettingsChange={designer.onSettingsChange}
          configurations={designer.configurations}
          providerModels={designer.providerModels}
          fallbackProviderId={designer.fallbackProviderId}
          fallbackModel={designer.fallbackModel}
          source={{ workspaceId, ...designer.source }}
          brief={designer.settings.brief}
          taskContext={editorTaskContext}
          onDraft={(codes) => {
            const rows = codes.map((code) => ({ class: code.name, description: code.definition }));
            setDraft(draftKey, {
              rows,
              taskContext: editorTaskContext,
              designedSignature: codebookSignature(rows),
            });
            toast.success('AI draft ready. Review the codes, then Save.');
          }}
        />
      ) : null}

      {dirty && !isEditOpen ? (
        <p
          role="status"
          className="text-label-secondary text-warning"
          data-testid="codebook-unsaved-note"
        >
          {isAiDraft
            ? 'An AI draft of this codebook is waiting.'
            : 'This codebook has unsaved changes.'}{' '}
          Choose Edit to save or discard them.
        </p>
      ) : null}

      {savedTaskContext ? (
        <p className="line-clamp-2 text-label-secondary text-description" title={savedTaskContext}>
          <span className="font-medium text-foreground">Task context:</span> {savedTaskContext}
        </p>
      ) : null}
      {classDescriptions.query.isLoading ? (
        <div className="rounded-md border border-surface-border px-4 py-3 text-body text-description">
          Loading codebook…
        </div>
      ) : classChips.length === 0 ? (
        <div className="rounded-md border border-dashed border-surface-border px-4 py-3 text-body text-description">
          No codes yet.
        </div>
      ) : (
        <TooltipProvider delayDuration={120} skipDelayDuration={0}>
          <div className="flex flex-wrap gap-1.5">
            {visibleClassChips.map((chip, index) =>
              // Only classes with a description get a hover tooltip; the trigger
              // is a native span (asChild) so the hover target stays explicit.
              chip.description ? (
                <Tooltip key={`${chip.name}-${String(index)}`}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default">
                      <Badge variant="secondary">{chip.name}</Badge>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs whitespace-normal break-words">
                    {chip.description}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Badge key={`${chip.name}-${String(index)}`} variant="secondary">
                  {chip.name}
                </Badge>
              ),
            )}
            {hiddenClassCount > 0 ? (
              <Badge variant="outline">+{String(hiddenClassCount)} more</Badge>
            ) : null}
          </div>
        </TooltipProvider>
      )}
      <CodebookSuggestions
        suggestions={codebookSuggestions(savedRows, savedCheck)}
        hint={
          savedCheck.codesWithSeveralDescriptions.length > 0
            ? 'Choose Edit to fix the codebook. AI Preview and Run wait until each code has one description.'
            : 'Choose Edit to fix the codebook.'
        }
      />
    </div>
  );
}
