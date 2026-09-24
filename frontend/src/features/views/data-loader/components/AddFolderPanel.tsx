import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFilePreview } from '../hooks/useFilePreview';
import type { FileTreeFile } from '../types';
import { FilePreviewContent } from './FilePreviewContent';

type FolderMode = 'texts' | 'tables';

interface AddFolderPanelProps {
  folderPath: string | null;
  /** Table files below the folder, in path order. */
  tableFiles: FileTreeFile[];
  onClose: () => void;
  /** Texts mode: the folder's text files become one document Data Block. */
  onConfirmTexts: () => Promise<void> | void;
  /** Tables mode: each selected file becomes its own Data Block. */
  onConfirmTables: (paths: string[]) => Promise<void> | void;
}

const TEXTS_DESCRIPTION =
  'Every .txt, .text, .md, .rst and .log file in this folder and its subfolders becomes one row of one Data Block. Other files are skipped and listed after adding.';
const TABLES_DESCRIPTION =
  'Each selected table file becomes its own Data Block, named after the file. Select a file name to preview it.';

/**
 * Add dialog for a folder, with two modes (issue 136): all text files as one
 * Data Block, or selected table files as one Data Block each.
 * Rendered by: DataLoaderFeature when a folder row's Add button is used.
 */
export function AddFolderPanel(props: AddFolderPanelProps) {
  if (!props.folderPath) return null;
  return <AddFolderPanelBody {...props} folderPath={props.folderPath} />;
}

function relativeTo(folderPath: string, filePath: string) {
  return filePath.startsWith(`${folderPath}/`) ? filePath.slice(folderPath.length + 1) : filePath;
}

function AddFolderPanelBody({
  folderPath,
  tableFiles,
  onClose,
  onConfirmTexts,
  onConfirmTables,
}: AddFolderPanelProps & { folderPath: string }) {
  const [mode, setMode] = useState<FolderMode>('texts');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(tableFiles[0]?.path ?? null);
  const [submitting, setSubmitting] = useState(false);
  const target = mode === 'texts' ? folderPath : previewPath;
  const preview = useFilePreview(target, true);

  const toggle = (path: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      if (mode === 'texts') await onConfirmTexts();
      else
        await onConfirmTables(
          tableFiles.filter((file) => selected.has(file.path)).map((file) => file.path),
        );
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const modeSwitch = (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        setMode(value as FolderMode);
      }}
    >
      <TabsList aria-label="Add folder as">
        <TabsTrigger value="texts">Texts as one Data Block</TabsTrigger>
        <TabsTrigger value="tables" disabled={tableFiles.length === 0}>
          Tables as separate Data Blocks ({tableFiles.length})
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const tablePicker =
    mode === 'tables' ? (
      <section aria-label="Table files" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-description">
            {selected.size} of {tableFiles.length} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(new Set(tableFiles.map((file) => file.path)));
            }}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(new Set());
            }}
          >
            Select none
          </Button>
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
          {tableFiles.map((file) => {
            const relative = relativeTo(folderPath, file.path);
            return (
              <li
                key={file.path}
                className={`flex items-center gap-2 rounded px-1 ${previewPath === file.path ? 'bg-list-hover/60' : ''}`}
              >
                <Checkbox
                  id={`table-file-${file.path}`}
                  aria-label={`Add ${relative}`}
                  checked={selected.has(file.path)}
                  onCheckedChange={(checked) => {
                    toggle(file.path, checked === true);
                  }}
                />
                <button
                  type="button"
                  className="min-w-0 truncate text-left text-body hover:underline"
                  aria-label={`Preview ${relative}`}
                  onClick={() => {
                    setPreviewPath(file.path);
                  }}
                >
                  {relative}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  const addCount = mode === 'texts' ? 1 : selected.size;
  const footer = (
    <CardFooter className="border-t px-6 py-4">
      <div className="flex w-full items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void confirm();
          }}
          disabled={submitting || addCount === 0}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding…
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              {mode === 'texts'
                ? 'Add to Project'
                : `Add ${String(addCount)} Data Block${addCount === 1 ? '' : 's'}`}
            </>
          )}
        </Button>
      </div>
    </CardFooter>
  );

  return (
    <FilePreviewContent
      filename={target ?? folderPath}
      open
      onClose={onClose}
      data={{
        previewData: preview.previewData,
        columns: preview.columns,
        loading: preview.loading,
        error: preview.error,
        fileType: preview.fileType,
        sheetNames: preview.sheetNames,
        selectedSheet: preview.selectedSheet,
        setSelectedSheet: preview.setSelectedSheet,
      }}
      title={`Add Folder: ${folderPath}`}
      description={mode === 'texts' ? TEXTS_DESCRIPTION : TABLES_DESCRIPTION}
      headerSlot={
        <div className="space-y-3">
          {modeSwitch}
          {tablePicker}
        </div>
      }
      footer={footer}
    />
  );
}
