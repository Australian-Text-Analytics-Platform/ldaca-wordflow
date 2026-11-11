import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FileTreeDirectory } from '@/features/views/data-loader/types';
import { LdacaImportDialog, type LdacaImportDialogProps } from './LdacaImportDialog';
import type { LargeUploadReminder } from '../hooks/useUploadState';
import { DESKTOP_APP_URL } from '../utils/largeUploadReminder';
import { formatBytes } from '../utils/format';

export interface DataLoaderDialogsProps {
  workspaceNameAlert: {
    message: string | null;
    onClose: () => void;
  };
  folderNameAlert: {
    message: string | null;
    onClose: () => void;
  };
  deleteWorkspace: {
    target: { id: string; name?: string | null } | null;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  };
  ldacaImport: LdacaImportDialogProps;
  createFolder: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    parentPath: string;
    parentLabel: string;
    name: string;
    onNameChange: (value: string) => void;
    creating: boolean;
    onCreate: () => void;
  };
  citation: {
    directory: FileTreeDirectory | null;
    path: string | null;
    content: string | null;
    loading: boolean;
    onClose: () => void;
  };
  uploadConflicts: {
    paths: string[];
    onClose: () => void;
  };
  /**
   * The reminder before a large upload on a shared server (issue 260) or an
   * upload of thousands of files anywhere (issue 447).
   */
  largeUpload?: {
    reminder: LargeUploadReminder | null;
    onAccept: () => void;
    onDecline: () => void;
  };
}

/**
 * Collects the modal/dialog surfaces owned by the Data Loader. The feature
 * passes state and callbacks here so destructive confirmations, token entry,
 * folder creation, citation viewing, and Oni imports stay visually colocated.
 * Rendered by `DataLoaderFeature` with dialog state owned by its workflow hooks.
 * Flow: render each modal from hook-owned state, wire form fields to hook setters, then
 * delegate confirmations/import/search actions back to DataLoaderFeature hooks.
 */
export function DataLoaderDialogs({
  workspaceNameAlert,
  folderNameAlert,
  deleteWorkspace,
  ldacaImport,
  createFolder,
  citation,
  uploadConflicts,
  largeUpload,
}: DataLoaderDialogsProps) {
  return (
    <>
      <AlertDialog
        open={Boolean(largeUpload?.reminder)}
        onOpenChange={(open) => {
          if (!open) largeUpload?.onDecline();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {largeUpload?.reminder?.manyFiles
                ? `This upload has ${(largeUpload.reminder.fileCount).toLocaleString('en-AU')} files`
                : `This is a large upload (${formatBytes(largeUpload?.reminder?.totalBytes)})`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {largeUpload?.reminder?.manyFiles ? (
                  <>
                    <p>
                      Each file is sent and stored separately, so thousands of files take a long
                      time: about 26,000 small text files took more than an hour. Wordflow is slower
                      while they upload, and the file list is slow to show them afterwards.
                    </p>
                    <p>
                      <strong>
                        Compress the folder into a ZIP file and upload the ZIP instead.
                      </strong>{' '}
                      It uploads as one file, and <strong>Add</strong> makes the same Data Block
                      from it, with one row per text file. Or upload anyway and expect to wait.
                    </p>
                  </>
                ) : null}
                {largeUpload?.reminder?.large ? (
                  <>
                    <p>
                      This Wordflow server is for trying out the software. It is shared with other
                      people, and it is not fast enough for a full corpus of this size
                      {largeUpload.reminder.manyFiles
                        ? ` (${formatBytes(largeUpload.reminder.totalBytes)})`
                        : ''}
                      : some tools may run very slowly.
                    </p>
                    <p>
                      For large corpora, install the{' '}
                      <a
                        href={DESKTOP_APP_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Wordflow desktop app
                      </a>{' '}
                      and work on your own computer. Or upload anyway and expect some tools to be
                      slow.
                    </p>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={largeUpload?.onDecline}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={largeUpload?.onAccept}>Upload anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(workspaceNameAlert.message)}
        onOpenChange={(open) => {
          if (!open) workspaceNameAlert.onClose();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid Project name</AlertDialogTitle>
            <AlertDialogDescription>{workspaceNameAlert.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={workspaceNameAlert.onClose}>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteWorkspace.target)}
        onOpenChange={(open) => {
          if (!open) deleteWorkspace.onCancel();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteWorkspace.target
                ? // an empty project name should fall through to the id
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  `This will permanently delete "${deleteWorkspace.target.name || deleteWorkspace.target.id}" and its data. This action cannot be undone.`
                : 'This will permanently delete the Project and its data. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={deleteWorkspace.onCancel}
              disabled={deleteWorkspace.deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteWorkspace.onConfirm}
              className="bg-error text-button-foreground hover:bg-error/90"
              disabled={deleteWorkspace.deleting}
            >
              {deleteWorkspace.deleting ? 'Deleting…' : 'Delete Project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LdacaImportDialog {...ldacaImport} />

      <Dialog open={createFolder.open} onOpenChange={createFolder.onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create folder</DialogTitle>
            <DialogDescription>
              {createFolder.parentPath
                ? `Create a subfolder inside ${createFolder.parentLabel}.`
                : 'Create a folder under the root files directory.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-folder-name">Folder name</Label>
              <Input
                id="new-folder-name"
                value={createFolder.name}
                onChange={(event) => {
                  createFolder.onNameChange(event.target.value);
                }}
                placeholder="Enter folder name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                createFolder.onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={createFolder.onCreate}
              disabled={createFolder.creating || !createFolder.name.trim()}
            >
              {createFolder.creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(citation.directory)}
        onOpenChange={(open) => {
          if (!open) citation.onClose();
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>README</DialogTitle>
            <DialogDescription>
              {citation.path ? `Source: ${citation.path}` : 'README'}
            </DialogDescription>
          </DialogHeader>
          {citation.loading ? (
            <div className="text-description flex items-center gap-2 text-body">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading README…
            </div>
          ) : citation.content ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{citation.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-description text-body">No README available for this folder.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadConflicts.paths.length > 0}
        onOpenChange={(open) => {
          if (!open) uploadConflicts.onClose();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload conflicts</DialogTitle>
            <DialogDescription>
              Nothing was uploaded. Resolve every conflicting User File path, then try again.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-md border p-3" tabIndex={0}>
            <ul className="space-y-1 text-body">
              {uploadConflicts.paths.map((path) => (
                <li key={path}>
                  <code className="break-all">{path}</code>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button onClick={uploadConflicts.onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(folderNameAlert.message)}
        onOpenChange={(open) => {
          if (!open) folderNameAlert.onClose();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid folder name</AlertDialogTitle>
            <AlertDialogDescription>
              {/* an empty alert message should fall through to the default copy */}
              {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
              {folderNameAlert.message ||
                'Folder names cannot include path separators or traversal sequences.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={folderNameAlert.onClose}>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
