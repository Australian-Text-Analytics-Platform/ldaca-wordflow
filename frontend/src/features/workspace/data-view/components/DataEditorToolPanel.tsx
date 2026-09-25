import { useEffect, useState } from 'react';
import { Loader2, Network, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import {
  buildCleanText,
  buildCombine,
  buildDuplicate,
  buildExtract,
  buildFindReplace,
  buildSplit,
  CLEAN_TEXT_OPERATIONS,
  templateColumnToken,
  type CleanTextOperation,
  type DataEditorDraft,
  type EmptyValues,
  type OutputTarget,
} from '../dataEditorRequests';
import { CombineTemplateField } from './CombineTemplateField';
import { DATA_EDITOR_TOOL_LABELS, useDataEditorToolStore } from '../dataEditorToolStore';

function ColumnSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: string;
  columns: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-body font-medium">{label}</span>
      <SearchableSelect
        options={columns.map((column) => ({ value: column }))}
        value={value}
        onChange={onChange}
        placeholder="Choose a column"
        ariaLabel={label}
        searchPlaceholder="Find a column… (* and ? wildcards)"
      />
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function OutputChoice({
  target,
  outputName,
  onTarget,
  onName,
}: {
  target: OutputTarget;
  outputName: string;
  onTarget: (target: OutputTarget) => void;
  onName: (name: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-body font-medium">Save result to</legend>
      <label className="flex items-center gap-2 text-body">
        <input
          type="radio"
          name="data-editor-output"
          checked={target === 'same'}
          onChange={() => {
            onTarget('same');
          }}
        />
        The same column
      </label>
      <label className="flex items-center gap-2 text-body">
        <input
          type="radio"
          name="data-editor-output"
          checked={target === 'new'}
          onChange={() => {
            onTarget('new');
          }}
        />
        A new column, right of it
      </label>
      {target === 'new' ? (
        <Input
          aria-label="New column name"
          value={outputName}
          placeholder="New column name"
          onChange={(event) => {
            onName(event.target.value);
          }}
        />
      ) : null}
    </fieldset>
  );
}

/**
 * The open Data Editor tool (issue 143). It replaces the Project Graph while
 * open; the table below previews the edit, and Apply commits it as one
 * Data Block Edit.
 */
export function DataEditorToolPanel() {
  const tool = useDataEditorToolStore((state) => state.tool);
  const nodeId = useDataEditorToolStore((state) => state.nodeId);
  const nodeName = useDataEditorToolStore((state) => state.nodeName);
  const columns = useDataEditorToolStore((state) => state.columns);
  const initialColumn = useDataEditorToolStore((state) => state.initialColumn);
  const initialOperation = useDataEditorToolStore((state) => state.initialOperation);
  const request = useDataEditorToolStore((state) => state.request);
  const changedRows = useDataEditorToolStore((state) => state.changedRows);
  const previewSample = useDataEditorToolStore((state) => state.previewSample);
  const setDraft = useDataEditorToolStore((state) => state.setDraft);
  const close = useDataEditorToolStore((state) => state.close);
  const setGraphVisible = useDataEditorToolStore((state) => state.setGraphVisible);
  const { applyEdit } = useWorkspaceActions();

  const [column, setColumn] = useState(initialColumn ?? '');
  const [pattern, setPattern] = useState('');
  const [replacement, setReplacement] = useState('');
  const [target, setTarget] = useState<OutputTarget>('same');
  const [outputName, setOutputName] = useState('');
  const [firstOnly, setFirstOnly] = useState(false);
  const [connector, setConnector] = useState(' ');
  const [template, setTemplate] = useState(initialColumn ? templateColumnToken(initialColumn) : '');
  const [emptyValues, setEmptyValues] = useState<EmptyValues>('blank');
  const [operation, setOperation] = useState<CleanTextOperation>(
    CLEAN_TEXT_OPERATIONS.find((option) => option.value === initialOperation)?.value ?? 'trim',
  );
  const [delimiter, setDelimiter] = useState(',');
  const [parts, setParts] = useState('2');
  const [touched, setTouched] = useState(false);
  const [applying, setApplying] = useState(false);

  const touch =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setTouched(true);
    };

  let draft: DataEditorDraft | null = null;
  if (tool === 'find_replace') {
    draft = buildFindReplace(
      { column, pattern, replacement, target, outputName, firstOnly },
      columns,
    );
  } else if (tool === 'extract') {
    draft = buildExtract({ column, pattern, outputName, firstOnly, connector }, columns);
  } else if (tool === 'combine') {
    draft = buildCombine({ template, outputName, emptyValues }, columns);
  } else if (tool === 'duplicate') {
    draft = buildDuplicate({ column }, columns);
  } else if (tool === 'clean_text') {
    draft = buildCleanText({ column, operation, target, outputName }, columns);
  } else if (tool === 'split') {
    draft = buildSplit({ column, delimiter, parts: Number(parts) }, columns);
  }
  const draftKey = draft ? JSON.stringify(draft) : '';

  useEffect(() => {
    // The tool starts clean when only the pre-filled column is set.
    setDraft(draft?.request ?? null, draft?.highlightColumns ?? [], touched);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftKey captures the draft value
  }, [draftKey, touched, setDraft]);

  if (!tool || !nodeId) return null;

  const apply = async () => {
    if (!request) return;
    setApplying(true);
    try {
      await applyEdit(nodeId, request);
      toast.success(`${DATA_EDITOR_TOOL_LABELS[tool]} applied to ${nodeName}.`);
      close();
    } catch (error) {
      toast.error((error as Error).message || 'The edit could not be applied.');
    } finally {
      setApplying(false);
    }
  };

  const status = !request
    ? 'Complete the settings to preview the result below.'
    : changedRows === null
      ? 'Previewing…'
      : `${changedRows.toLocaleString()} row${changedRows === 1 ? '' : 's'} changed`;

  return (
    <section
      aria-label={`${DATA_EDITOR_TOOL_LABELS[tool]} on ${nodeName}`}
      className="flex h-full min-h-0 flex-col bg-panel"
    >
      <header className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">
          {DATA_EDITOR_TOOL_LABELS[tool]}
          <span className="font-normal text-description"> · {nodeName}</span>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => {
            setGraphVisible(true);
          }}
        >
          <Network className="mr-1 h-3.5 w-3.5" />
          Show Project Graph
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Close tool"
          onClick={close}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tool === 'combine' ? (
          <>
            <CombineTemplateField
              value={template}
              columns={columns}
              onChange={touch(setTemplate)}
            />
            <TextField
              id="combine-name"
              label="New column name"
              value={outputName}
              onChange={touch(setOutputName)}
            />
            <fieldset className="space-y-1">
              <legend className="text-body font-medium">When a value is missing</legend>
              <label className="flex items-center gap-2 text-body">
                <input
                  type="radio"
                  name="combine-empty-values"
                  checked={emptyValues === 'blank'}
                  onChange={() => {
                    touch(setEmptyValues)('blank');
                  }}
                />
                Treat it as blank text
              </label>
              <label className="flex items-center gap-2 text-body">
                <input
                  type="radio"
                  name="combine-empty-values"
                  checked={emptyValues === 'empty_result'}
                  onChange={() => {
                    touch(setEmptyValues)('empty_result');
                  }}
                />
                Leave the combined value empty
              </label>
            </fieldset>
            {request && previewSample !== undefined ? (
              <p className="text-label-secondary text-description">
                First row on this page:{' '}
                {previewSample === null ? (
                  <span className="italic">empty</span>
                ) : (
                  <span className="break-words font-mono text-foreground">
                    &ldquo;{previewSample}&rdquo;
                  </span>
                )}
              </p>
            ) : null}
          </>
        ) : (
          <ColumnSelect
            label="Column"
            value={column}
            columns={columns}
            onChange={touch(setColumn)}
          />
        )}

        {tool === 'find_replace' ? (
          <>
            <TextField
              id="find-pattern"
              label="Find (regular expression)"
              value={pattern}
              placeholder="e.g. \s+"
              onChange={touch(setPattern)}
            />
            <TextField
              id="find-replacement"
              label="Replace with"
              value={replacement}
              onChange={touch(setReplacement)}
            />
            <label className="flex items-center gap-2 text-body">
              <Checkbox
                checked={firstOnly}
                onCheckedChange={(checked) => {
                  touch(setFirstOnly)(checked === true);
                }}
              />
              Only the first match in each row
            </label>
            <OutputChoice
              target={target}
              outputName={outputName}
              onTarget={touch(setTarget)}
              onName={touch(setOutputName)}
            />
          </>
        ) : null}

        {tool === 'extract' ? (
          <>
            <TextField
              id="extract-pattern"
              label="Extract matches of (regular expression)"
              value={pattern}
              placeholder="e.g. #\w+"
              onChange={touch(setPattern)}
            />
            <label className="flex items-center gap-2 text-body">
              <Checkbox
                checked={firstOnly}
                onCheckedChange={(checked) => {
                  touch(setFirstOnly)(checked === true);
                }}
              />
              Only the first match in each row
            </label>
            <TextField
              id="extract-connector"
              label="Join several matches with"
              value={connector}
              onChange={touch(setConnector)}
            />
            <TextField
              id="extract-name"
              label="New column name"
              value={outputName}
              onChange={touch(setOutputName)}
            />
          </>
        ) : null}

        {tool === 'duplicate' ? (
          <p className="text-body text-description">
            The copy is placed right of the original and named like a copied file, for example
            &ldquo;{column || 'text'} copy&rdquo;.
          </p>
        ) : null}

        {tool === 'clean_text' ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="clean-operation">Cleaning</Label>
              <Select
                value={operation}
                onValueChange={(value) => {
                  touch(setOperation)(value as CleanTextOperation);
                }}
              >
                <SelectTrigger id="clean-operation" aria-label="Cleaning">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLEAN_TEXT_OPERATIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <OutputChoice
              target={target}
              outputName={outputName}
              onTarget={touch(setTarget)}
              onName={touch(setOutputName)}
            />
          </>
        ) : null}

        {tool === 'split' ? (
          <>
            <TextField
              id="split-delimiter"
              label="Split on"
              value={delimiter}
              onChange={touch(setDelimiter)}
            />
            <div className="space-y-1">
              <Label htmlFor="split-parts">Number of columns</Label>
              <Input
                id="split-parts"
                type="number"
                min={2}
                max={50}
                value={parts}
                onChange={(event) => {
                  touch(setParts)(event.target.value);
                }}
              />
            </div>
            <p className="text-label-secondary text-description">
              New columns {column ? `${column}_1, ${column}_2, …` : ''} are placed right of the
              column. The last one keeps any remaining text.
            </p>
          </>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-surface-border px-3 py-2">
        <p role="status" className="min-w-0 flex-1 text-label-secondary text-description">
          {status}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={close} disabled={applying}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!request || applying}
          onClick={() => {
            void apply();
          }}
        >
          {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Apply
        </Button>
      </footer>
    </section>
  );
}
