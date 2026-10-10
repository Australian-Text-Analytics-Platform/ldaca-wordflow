/**
 * Labels kept from an AI annotation run that did not finish (issue 371).
 *
 * A run keeps the labels it has received in a temporary label Data Block
 * (the text column and the annotation column, one row per distinct text). A
 * run that finishes removes it; one that stops, fails or is interrupted
 * leaves it, and this notice offers to write its labels into the column or
 * to remove it. While a run goes, it says the labels are being kept.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { applyAnnotationLabels, type WorkspaceNodeInfo } from '@/api';
import { savedLabelBlocks, type SavedLabelsBlock } from './savedLabelBlocks';
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
import { invalidateNodeWorkspaceQueries } from '@/features/workspace/common/hooks/workspaceMutationCache';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { toastError } from '@/lib/toastError';

export function AnnotationSavedLabelsNotice({
  workspaceId,
  nodes,
  sourceNodeId,
  running,
}: {
  workspaceId: string | null;
  nodes: readonly WorkspaceNodeInfo[];
  sourceNodeId: string;
  running: boolean;
}) {
  const queryClient = useQueryClient();
  const { deleteNode } = useWorkspaceActions();
  const [written, setWritten] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SavedLabelsBlock | null>(null);
  const blocks = savedLabelBlocks(nodes, sourceNodeId);
  if (blocks.length === 0) return null;

  if (running) {
    return (
      <p className="mt-2 text-label-secondary text-description">
        Labels are kept in &ldquo;{blocks[blocks.length - 1]?.name}&rdquo; as they return, so a
        stopped run loses none.
      </p>
    );
  }

  const write = async (block: SavedLabelsBlock) => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const { data } = await applyAnnotationLabels({
        path: { workspace_id: workspaceId, node_id: block.id },
        throwOnError: true,
      });
      invalidateNodeWorkspaceQueries(queryClient, workspaceId, sourceNodeId, {
        includeData: true,
        includeSchema: true,
      });
      setWritten(new Set([...written, block.id]));
      toast.success(
        `${data.written_rows.toLocaleString()} row${data.written_rows === 1 ? '' : 's'} labelled in "${data.annotation_column}" from the saved labels.`,
      );
    } catch (error) {
      toastError(error, "The saved labels couldn't be written.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (block: SavedLabelsBlock) => {
    setBusy(true);
    try {
      await deleteNode(block.id);
    } catch (error) {
      toastError(error, "The label Data Block couldn't be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      {blocks.map((block) => {
        const done = written.has(block.id);
        const count =
          block.labels === null
            ? 'Labels'
            : `${block.labels.toLocaleString()} label${block.labels === 1 ? '' : 's'}`;
        return (
          <div
            key={block.id}
            role="note"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warning/60 bg-warning-background/60 p-3 text-body text-warning"
          >
            <p className="min-w-0 flex-1">
              {done
                ? `The saved labels are in "${block.column}" now. You can remove "${block.name}".`
                : `${count} from a run that didn't finish are saved in "${block.name}".`}
            </p>
            {done ? null : (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void write(block);
                }}
              >
                Write them into &ldquo;{block.column}&rdquo;
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (done) void remove(block);
                else setConfirmRemove(block);
              }}
            >
              Remove
            </Button>
          </div>
        );
      })}
      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the saved labels?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{confirmRemove?.name}&rdquo; holds labels that are not in &ldquo;
              {confirmRemove?.column}&rdquo; yet. Removing it loses them, and getting them again
              means sending those texts to the AI provider again.
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
