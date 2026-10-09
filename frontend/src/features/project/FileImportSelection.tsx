import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useState } from 'react';
import type { FileImportPlan, FileImportRequest, SkippedImportFile } from './filesApi';
const textFormats = new Set(['txt', 'text', 'md', 'rst', 'log']);
const key = (path: string, sheet: string | null) => JSON.stringify([path, sheet]);
export function SkippedImportFiles({ files }: { files: SkippedImportFile[] }) {
  if (!files.length) return null;
  const groups = new Map<string, number>();
  for (const file of files) groups.set(file.reason, (groups.get(file.reason) ?? 0) + 1);
  return (
    <div role="status" className="space-y-1 text-body-secondary text-description">
      <p>{files.length} files skipped:</p>
      <ul className="list-inside list-disc">
        {[...groups]
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => (
            <li key={reason}>
              {reason} ({count})
            </li>
          ))}
      </ul>
    </div>
  );
}
export function FileImportSelection({
  plan,
  onImport,
  onCancel,
}: {
  plan: FileImportPlan;
  onImport: (selected: NonNullable<FileImportRequest['selected']>) => void;
  onCancel: () => void;
}) {
  const selections = plan.files.flatMap<{ path: string; sheet: string | null }>((file) =>
    file.sheets.length
      ? file.sheets.map((sheet) => ({ path: file.path, sheet }))
      : [{ path: file.path, sheet: null }],
  );
  const [selected, setSelected] = useState(
    () => new Set(selections.map((s) => key(s.path, s.sheet))),
  );
  const texts = plan.files.filter((file) => textFormats.has(file.format));
  function toggle(keys: string[], checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const value of keys) {
        if (checked) next.add(value);
        else next.delete(value);
      }
      return next;
    });
  }
  return (
    <section aria-label="Choose import contents" className="space-y-3 rounded-md border p-3">
      <h3 className="text-body font-semibold">Choose import contents</h3>
      {texts.length > 0 && (
        <label className="flex items-start gap-2 text-body-secondary">
          <Checkbox
            checked={texts.every((f) => selected.has(key(f.path, null)))}
            onCheckedChange={(checked) =>
              toggle(
                texts.map((f) => key(f.path, null)),
                checked === true,
              )
            }
          />
          <span>
            Combine {texts.length} text files into {plan.text_name}
          </span>
        </label>
      )}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {plan.files
          .filter((file) => !textFormats.has(file.format))
          .map((file) => {
            const sheets = file.sheets.length ? file.sheets : [null];
            return (
              <div key={file.path} className="space-y-1">
                {file.sheets.length > 1 && (
                  <p className="break-all text-body-secondary font-medium">{file.path}</p>
                )}
                {sheets.map((sheet) => (
                  <label
                    key={key(file.path, sheet)}
                    className="flex items-start gap-2 text-body-secondary"
                  >
                    <Checkbox
                      checked={selected.has(key(file.path, sheet))}
                      onCheckedChange={(checked) =>
                        toggle([key(file.path, sheet)], checked === true)
                      }
                    />
                    <span className="break-all">{file.sheets.length > 1 ? sheet : file.path}</span>
                  </label>
                ))}
              </div>
            );
          })}
      </div>
      <SkippedImportFiles files={plan.skipped} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!selected.size}
          onClick={() => onImport(selections.filter((s) => selected.has(key(s.path, s.sheet))))}
        >
          Import selected
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
