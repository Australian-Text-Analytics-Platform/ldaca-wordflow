import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { Label } from '@/components/ui/label';

/**
 * Shows invisible delimiters, so a space or tab chip is not blank: a lone
 * space or tab as a word, and spaces or tabs inside longer ones as ␣ and ⇥.
 */
function delimiterLabel(delimiter: string): string {
  if (delimiter === ' ') return 'space';
  if (delimiter === '\t') return 'tab';
  return delimiter.replaceAll(' ', '␣').replaceAll('\t', '⇥');
}

/**
 * Split column delimiters as chips (issue 163): each Enter adds what was
 * typed (punctuation, a space, or several characters), a delimiter already
 * listed is not added again, and × or Backspace in the empty field removes
 * one. New line is a separate option because Enter adds the chip.
 */
export function DelimiterChips({
  delimiters,
  onChange,
}: {
  delimiters: string[];
  onChange: (delimiters: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const add = () => {
    if (draft === '') return;
    if (!delimiters.includes(draft)) onChange([...delimiters, draft]);
    setDraft('');
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Delimiters</Label>
      <div className="flex min-h-control flex-wrap items-center gap-1 rounded-sm border border-input-border bg-[var(--vscode-input-background)] px-1 py-0.5 focus-within:border-focus">
        {delimiters.map((delimiter) => (
          <span
            key={delimiter}
            className="inline-flex items-center gap-1 rounded-sm border border-surface-border bg-panel px-1.5 font-mono text-body"
          >
            {delimiterLabel(delimiter)}
            <button
              type="button"
              aria-label={`Remove delimiter ${delimiterLabel(delimiter)}`}
              className="text-description hover:text-foreground"
              onClick={() => {
                onChange(delimiters.filter((item) => item !== delimiter));
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          spellCheck={false}
          placeholder={delimiters.length ? 'Add another' : 'Type a delimiter, then Enter'}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 font-mono text-body outline-hidden placeholder:text-[var(--vscode-input-placeholderForeground)]"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            } else if (event.key === 'Backspace' && draft === '' && delimiters.length > 0) {
              onChange(delimiters.slice(0, -1));
            }
          }}
        />
      </div>
      <p className="text-label-secondary text-description">
        Press Enter after each delimiter: punctuation, a space, or several characters.
      </p>
    </div>
  );
}
