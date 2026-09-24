import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFilePreview } from '../hooks/useFilePreview';
import { FilePreviewContent } from './FilePreviewContent';

type BatchMode = 'texts' | 'tables';

/** A folder, or a ZIP archive, whose files load together (issue 136). */
export interface BatchSource {
  path: string;
  kind: 'folder' | 'zip';
}

/** One table file: a user-file path (folder) or a member path (ZIP). */
interface BatchTableFile {
  id: string;
  label: string;
}

interface AddBatchPanelProps {
  source: BatchSource | null;
  /** Table files in the folder or ZIP, in path order. */
  tableFiles: BatchTableFile[];
  tablesLoading?: boolean;
  onClose: () => void;
  /** Texts mode: all text files become one document Data Block. */
  onConfirmTexts: () => Promise<void> | void;
  /** Tables mode: each selected table file becomes its own Data Block. */
  onConfirmTables: (ids: string[]) => Promise<void> | void;
}

const TEXTS_DESCRIPTION = {
  folder:
    'Every .txt, .text, .md, .rst and .log file in this folder and its subfolders becomes one row of one Data Block. Other files, including ZIP archives, are skipped and listed after adding.',
  zip: 'Every .txt, .text, .md, .rst and .log file in this ZIP becomes one row of one Data Block. Other files, including nested ZIP archives, are skipped and listed after adding.',
};
const TABLES_DESCRIPTION =
  'Each selected table file becomes its own Data Block, named after the file. Select a file name to preview it.';

/**
 * Add dialog for a folder or a ZIP archive, with two modes (issue 136): all
 * text files as one Data Block, or selected table files as one Data Block each.
 * Rendered by: DataLoaderFeature when a folder or ZIP row's Add button is used.
 */
export function AddBatchPanel(props: AddBatchPanelProps) {
  if (!props.source) return null;
  return <AddBatchPanelBody {...props} source={props.source} />;
}

function AddBatchPanelBody({
  source,
  tableFiles,
  tablesLoading = false,
  onClose,
  onConfirmTexts,
  onConfirmTables,
}: AddBatchPanelProps & { source: BatchSource }) {
  const [mode, setMode] = useState<BatchMode>('texts');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [chosenPreview, setChosenPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isZip = source.kind === 'zip';
  const previewId = chosenPreview ?? tableFiles[0]?.id ?? null;
  // A ZIP member previews through its archive; a folder file previews itself.
  const previewPath = mode === 'texts' || isZip ? source.path : previewId;
  const previewMember = mode === 'tables' && isZip ? previewId : null;
  const preview = useFilePreview(previewPath, true, previewMember);

  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      if (mode === 'texts') {
        await onConfirmTexts();
      } else {
        await onConfirmTables(
          tableFiles.filter((file) => selected.has(file.id)).map((file) => file.id),
        );
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const modeSwitch = (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        setMode(value as BatchMode);
      }}
    >
      <TabsList aria-label={isZip ? 'Add ZIP as' : 'Add folder as'}>
        <TabsTrigger value="texts">Texts as one Data Block</TabsTrigger>
        <TabsTrigger value="tables" disabled={tablesLoading || tableFiles.length === 0}>
          Tables as separate Data Blocks ({tablesLoading ? '…' : tableFiles.length})
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
              setSelected(new Set(tableFiles.map((file) => file.id)));
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
          {tableFiles.map((file) => (
            <li
              key={file.id}
              className={`flex items-center gap-2 rounded px-1 ${previewId === file.id ? 'bg-list-hover/60' : ''}`}
            >
              <Checkbox
                id={`table-file-${file.id}`}
                aria-label={`Add ${file.label}`}
                checked={selected.has(file.id)}
                onCheckedChange={(checked) => {
                  toggle(file.id, checked === true);
                }}
              />
              <button
                type="button"
                className="min-w-0 truncate text-left text-body hover:underline"
                aria-label={`Preview ${file.label}`}
                onClick={() => {
                  setChosenPreview(file.id);
                }}
              >
                {file.label}
              </button>
            </li>
          ))}
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
      filename={source.path}
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
      title={isZip ? `Add ZIP: ${source.path}` : `Add Folder: ${source.path}`}
      description={mode === 'texts' ? TEXTS_DESCRIPTION[source.kind] : TABLES_DESCRIPTION}
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
