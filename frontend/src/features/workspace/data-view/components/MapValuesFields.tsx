/**
 * Map values (issue 368): each value of the chosen column on the left, with
 * its row count, and an input for its new value on the right. Fifty values a
 * page, most common first or A to Z ignoring case; typed values are offered
 * in every input, so several values are easily given one group.
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import type { ColumnValueCountsResource } from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mapValuesEmptied } from '../dataEditorRequests';

const PAGE_SIZE = 50;
const SUGGESTIONS_ID = 'map-values-suggestions';

type MapSort = 'common' | 'name';

// Case-insensitive natural order: "apple" beside "Apple", "Q9" before "Q10".
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface Props {
  counts: ColumnValueCountsResource | undefined;
  loading: boolean;
  error: string | null;
  inputs: Readonly<Record<string, string>>;
  onInput: (value: string, text: string) => void;
  emptyTo: string;
  onEmptyTo: (text: string) => void;
  keepUnlisted: boolean;
  onKeepUnlisted: (keep: boolean) => void;
  /** Copies each original value into its blank input, and keeps unlisted values. */
  onFillRest: () => void;
}

export function MapValuesFields({
  counts,
  loading,
  error,
  inputs,
  onInput,
  emptyTo,
  onEmptyTo,
  keepUnlisted,
  onKeepUnlisted,
  onFillRest,
}: Props) {
  const [sort, setSort] = useState<MapSort>('common');
  const [page, setPage] = useState(0);

  if (error) {
    return (
      <p role="alert" className="text-body text-error">
        {error}
      </p>
    );
  }
  if (loading || !counts) {
    return <p className="text-body text-description">Reading the column&rsquo;s values…</p>;
  }

  const listed = counts.labels.map((value, index) => ({ value, count: counts.counts[index] ?? 0 }));
  const ordered =
    sort === 'name'
      ? listed.toSorted((left, right) => collator.compare(left.value, right.value))
      : listed;
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = ordered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const suggestions = [
    ...new Set([...Object.values(inputs), emptyTo].map((text) => text.trim()).filter(Boolean)),
  ].toSorted((left, right) => collator.compare(left, right));
  const emptied = mapValuesEmptied(listed, inputs, {
    values: counts.unlisted_values,
    rows: counts.unlisted_rows,
    keep: keepUnlisted,
  });
  const blankInputs =
    listed.some(({ value }) => !(inputs[value] ?? '').trim()) ||
    (counts.unlisted_values > 0 && !keepUnlisted);

  if (listed.length === 0 && counts.empty_count === 0) {
    return <p className="text-body text-description">This column has no values.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor="map-values-sort">Order</Label>
          <Select
            value={sort}
            onValueChange={(value) => {
              setSort(value as MapSort);
              setPage(0);
            }}
          >
            <SelectTrigger id="map-values-sort" className="h-8 w-52 text-body">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="common">Most common first</SelectItem>
              <SelectItem value="name">A to Z, ignoring case</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!blankInputs}
          title="Copy the original value into every blank input, and keep values not listed"
          onClick={onFillRest}
        >
          Fill the rest
        </Button>
      </div>

      {counts.unlisted_values > 0 ? (
        <div role="note" className="space-y-1 rounded-md border border-surface-border p-2">
          <p className="text-label-secondary text-description">
            {counts.distinct_count.toLocaleString()} values: only the{' '}
            {counts.limit.toLocaleString()} most common are listed.{' '}
            {counts.unlisted_values.toLocaleString()} more ({counts.unlisted_rows.toLocaleString()}{' '}
            rows) are not listed.
          </p>
          <label className="flex items-center gap-2 text-label-secondary">
            <Checkbox
              checked={keepUnlisted}
              onCheckedChange={(checked) => {
                onKeepUnlisted(checked === true);
              }}
            />
            Values not listed keep their original value (otherwise empty)
          </label>
        </div>
      ) : null}

      <table className="w-full table-fixed border-collapse text-body">
        <thead>
          <tr className="text-left text-label-secondary text-description">
            <th scope="col" className="w-1/2 pb-1 font-medium">
              Value
            </th>
            <th scope="col" className="pb-1 pl-2 font-medium">
              New value
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ value, count }) => (
            <tr key={value} className="border-t border-surface-border/60">
              <td className="py-1 pr-2 align-middle">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="min-w-0 truncate" title={value}>
                    {value}
                  </span>
                  <span className="shrink-0 text-label-secondary text-description tabular-nums">
                    {count.toLocaleString()}
                  </span>
                </div>
              </td>
              <td className="py-1 pl-2">
                <Input
                  aria-label={`New value for ${value}`}
                  list={SUGGESTIONS_ID}
                  value={inputs[value] ?? ''}
                  onChange={(event) => {
                    onInput(value, event.target.value);
                  }}
                  className="h-7 text-body"
                />
              </td>
            </tr>
          ))}
          {counts.empty_count > 0 && current === pages - 1 ? (
            <tr className="border-t border-surface-border/60">
              <td className="py-1 pr-2 align-middle">
                <div className="flex items-baseline gap-1.5">
                  <span className="italic text-description">(empty)</span>
                  <span className="text-label-secondary text-description tabular-nums">
                    {counts.empty_count.toLocaleString()}
                  </span>
                </div>
              </td>
              <td className="py-1 pl-2">
                <Input
                  aria-label="New value for empty cells"
                  list={SUGGESTIONS_ID}
                  value={emptyTo}
                  placeholder="Stays empty"
                  onChange={(event) => {
                    onEmptyTo(event.target.value);
                  }}
                  className="h-7 text-body"
                />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <datalist id={SUGGESTIONS_ID}>
        {suggestions.map((text) => (
          <option key={text} value={text} />
        ))}
      </datalist>

      {pages > 1 ? (
        <nav aria-label="Value pages" className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Previous page"
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-label-secondary text-description tabular-nums">
            Page {current + 1} of {pages}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Next page"
            disabled={current === pages - 1}
            onClick={() => {
              setPage(current + 1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      ) : null}

      {emptied.rows > 0 ? (
        <p role="status" className="flex items-start gap-1.5 text-label-secondary text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {emptied.rows.toLocaleString()} row{emptied.rows === 1 ? '' : 's'} (
            {emptied.values.toLocaleString()} value{emptied.values === 1 ? '' : 's'}) will be empty
            in the new column. Type new values, or use Fill the rest to keep the original values.
          </span>
        </p>
      ) : null}
    </div>
  );
}
