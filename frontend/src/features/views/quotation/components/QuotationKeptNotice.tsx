/**
 * Quotations kept from a Quotation Run that didn't finish (issue 381).
 *
 * A Run that Stop kept shows its documents as a Result, and says Run
 * continues from there. A Run stopped at once, that failed or was
 * interrupted leaves its quotations in a temporary Data Block; the next Run
 * on the same Data Block, column and engine skips their texts. This notice
 * says so and can remove the block.
 */
import { useState } from 'react';
import type { WorkspaceNodeInfo } from '@/api';
import {
  keptQuotationBlocks,
  resumesFromKeptQuotations,
  type KeptQuotationsBlock,
  type ResumeSettings,
} from './keptQuotationBlocks';
import { Button } from '@/components/ui/button';
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
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { toastError } from '@/lib/toastError';

export function QuotationKeptNotice({
  nodes,
  sourceNodeId,
  checkedCount,
  documentCount,
  settings,
}: {
  nodes: readonly WorkspaceNodeInfo[];
  sourceNodeId: string;
  /** Documents a Run Stop kept had checked, or null for a complete Run. */
  checkedCount: number | null;
  documentCount: number | null;
  /** The tab's text column and engine: kept quotations for others can't resume. */
  settings: ResumeSettings;
}) {
  const { deleteNode } = useWorkspaceActions();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<KeptQuotationsBlock | null>(null);
  const resumable = (block: KeptQuotationsBlock) => resumesFromKeptQuotations([block], settings);
  // A Run Stop kept says so itself; its own kept quotations need no second note.
  const blocks = keptQuotationBlocks(nodes, sourceNodeId).filter(
    (block) => checkedCount === null || !resumable(block),
  );
  const stoppedNote =
    checkedCount !== null ? (
      <p role="note" className="mt-2 text-label-secondary text-description">
        Stopped early: {checkedCount.toLocaleString()}
        {documentCount !== null ? ` of ${documentCount.toLocaleString()}` : ''} documents checked.
        Resume continues from there.
      </p>
    ) : null;
  if (blocks.length === 0) return stoppedNote;

  const remove = async (block: KeptQuotationsBlock) => {
    setBusy(true);
    try {
      await deleteNode(block.id);
    } catch (error) {
      toastError(error, "The kept quotations couldn't be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      {stoppedNote}
      {blocks.map((block) => (
        <div
          key={block.id}
          role="note"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-surface-border bg-panel p-3 text-body"
        >
          <p className="min-w-0 flex-1">
            Quotations for{' '}
            {block.texts === null ? 'the texts' : `${block.texts.toLocaleString()} texts`} from a
            Run that didn&apos;t finish are kept in &ldquo;{block.name}&rdquo;.{' '}
            {resumable(block)
              ? 'Resume continues from there.'
              : block.column === settings.column
                ? 'Choose the engine it used to resume.'
                : `Choose the “${block.column}” text column to resume.`}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setConfirmRemove(block);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the kept quotations?</AlertDialogTitle>
            <AlertDialogDescription>
              The next Run then checks every document again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemove) void remove(confirmRemove);
                setConfirmRemove(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
