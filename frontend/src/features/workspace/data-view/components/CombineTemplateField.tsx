import { useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parseCombineTemplate, templateColumnToken } from '../dataEditorRequests';

const MAX_SUGGESTIONS = 8;

/** The column name being typed after an unclosed "{" before the caret. */
function openFragment(text: string, caret: number): { start: number; query: string } | null {
  const match = /\{([^{}]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  const start = caret - match[0].length;
  // "{{" is a literal brace, not the start of a column.
  if (text[start - 1] === '{') return null;
  return { start, query: match[1] ?? '' };
}

function suggestionsFor(query: string, columns: readonly string[]): string[] {
  const needle = query.toLowerCase();
  const prefix = columns.filter((column) => column.toLowerCase().startsWith(needle));
  const inner = columns.filter(
    (column) => !prefix.includes(column) && column.toLowerCase().includes(needle),
  );
  return [...prefix, ...inner].slice(0, MAX_SUGGESTIONS);
}

/**
 * The Combine columns template (issue 143): text with columns in braces, such
 * as "{title}: {body}". Typing "{" suggests matching columns, and the
 * searchable Insert column picker adds one at the cursor, so long column lists
 * never need scrolling or dragging.
 */
export function CombineTemplateField({
  value,
  columns,
  onChange,
}: {
  value: string;
  columns: string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const listboxId = `${id}-suggestions`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(value.length);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const fragment = caret === null ? null : openFragment(value, caret);
  const suggestions =
    fragment && dismissedAt !== fragment.start ? suggestionsFor(fragment.query, columns) : [];
  const activeIndex = Math.min(active, suggestions.length - 1);
  const parsed = parseCombineTemplate(value, columns);
  const used = [
    ...new Set(
      parsed.parts.flatMap((part) =>
        part.kind === 'column' && columns.includes(part.column) ? [part.column] : [],
      ),
    ),
  ];

  const trackCaret = () => {
    const position = textareaRef.current?.selectionStart ?? value.length;
    caretRef.current = position;
    setCaret(position);
  };

  /** Replaces `start..end` with the column token and puts the caret after it. */
  const insertAt = (column: string, start: number, end: number) => {
    const skipClose = value[end] === '}';
    const token = templateColumnToken(column);
    const next = value.slice(0, start) + token + value.slice(skipClose ? end + 1 : end);
    const position = start + token.length;
    onChange(next);
    caretRef.current = position;
    setCaret(position);
    setActive(0);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    }, 0);
  };

  const describedBy = `${id}-help`;
  return (
    <div className="space-y-1">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={id}>Template</Label>
        <SearchableSelect
          options={columns.map((column) => ({ value: column }))}
          value=""
          onChange={(column) => {
            insertAt(column, caretRef.current, caretRef.current);
          }}
          placeholder={
            <span className="inline-flex items-center gap-1 text-foreground">
              <Plus className="h-3 w-3" aria-hidden="true" />
              Insert column
            </span>
          }
          ariaLabel="Insert column"
          triggerClassName="h-7 w-auto"
          searchPlaceholder="Find a column… (* and ? wildcards)"
        />
      </div>
      <div className="relative">
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          rows={2}
          placeholder="e.g. {title}: {body}"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length > 0 ? listboxId : undefined}
          aria-activedescendant={
            suggestions.length > 0 ? `${listboxId}-${String(activeIndex)}` : undefined
          }
          aria-describedby={describedBy}
          aria-invalid={parsed.error !== null || parsed.unknown.length > 0}
          className="font-mono"
          onChange={(event) => {
            onChange(event.target.value);
            const position = event.target.selectionStart;
            caretRef.current = position;
            setCaret(position);
            setActive(0);
          }}
          onSelect={trackCaret}
          onBlur={() => {
            setCaret(null);
          }}
          onKeyDown={(event) => {
            if (!fragment || suggestions.length === 0 || caret === null) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((activeIndex + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((activeIndex - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === 'Enter' || event.key === 'Tab') {
              const column = suggestions[activeIndex];
              if (!column) return;
              event.preventDefault();
              insertAt(column, fragment.start, caret);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setDismissedAt(fragment.start);
            }
          }}
        />
        {suggestions.length > 0 && fragment && caret !== null ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Matching columns"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-[var(--vscode-widget-border)] bg-widget p-1 text-widget-foreground shadow-[var(--vscode-shadow-lg)]"
          >
            {suggestions.map((column, index) => (
              <li
                key={column}
                id={`${listboxId}-${String(index)}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex h-control-sm cursor-pointer items-center truncate rounded-sm px-2 text-body',
                  index === activeIndex && 'bg-list-hover text-foreground',
                )}
                // Keep focus in the textarea so the caret position survives.
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertAt(column, fragment.start, caret);
                }}
              >
                {column}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p id={describedBy} className="text-label-secondary text-description" aria-live="polite">
        {parsed.error ? (
          <span className="text-error">{parsed.error}</span>
        ) : parsed.unknown.length > 0 ? (
          <span className="text-error">
            Not a column on this Data Block: {parsed.unknown.join(', ')}
          </span>
        ) : used.length > 0 ? (
          <>
            Uses {used.join(', ')}. Write {'{{'} or {'}}'} for a literal brace.
          </>
        ) : (
          <>Type {'{'} to pick a column, or use Insert column. Other text is kept as written.</>
        )}
      </p>
    </div>
  );
}
