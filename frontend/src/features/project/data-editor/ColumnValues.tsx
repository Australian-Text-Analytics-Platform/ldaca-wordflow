import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { querySql } from '@/features/project/api';
import { identifier, objectSql, targetKey, type DataTarget } from '@/features/project/objects';
import { OperationError } from '@/features/project/OperationError';
import { objectDependencies } from '@/features/project/projectChanges';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { EditorDraft } from './expressions';

const valueLabel = (value: unknown) =>
  value === null
    ? 'Missing'
    : value === ''
      ? 'Empty text'
      : typeof value === 'string' && /^\s+$/.test(value)
        ? `Blank text (${JSON.stringify(value)})`
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);

export function ColumnValues({
  base,
  target,
  draft,
  ordering,
  category,
  onChange,
}: {
  base: string;
  target: DataTarget;
  draft: EditorDraft;
  ordering: boolean;
  category: boolean;
  onChange: (patch: Partial<EditorDraft>) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [dragged, setDragged] = useState<string>();
  const values = useQuery({
    queryKey: [
      'native',
      base,
      'editor-values',
      targetKey(target),
      draft.column,
      ordering && category,
    ],
    queryFn: async ({ signal }) =>
      Array.from(
        await querySql(
          base,
          [
            {
              sql:
                ordering && category
                  ? `SELECT CAST(to_json(value) AS VARCHAR) AS value_key,value AS label FROM (SELECT enum_range(first(${identifier(draft.column)})) AS labels FROM ${objectSql(target)}), UNNEST(labels) WITH ORDINALITY AS categories(value,position) ORDER BY position`
                  : `WITH values AS (SELECT DISTINCT ${identifier(draft.column)} AS value FROM ${objectSql(target)}) SELECT CAST(to_json(value) AS VARCHAR) AS value_key, CAST(value AS VARCHAR) AS label FROM values ORDER BY value`,
            },
          ],
          signal,
        ),
      ),
    enabled: Boolean(draft.column),
    meta: { ...objectDependencies(target), reportError: false },
  });
  useEffect(() => {
    if (ordering && values.data && !values.isFetching && draft.categoryOrder === null)
      onChange({
        categoryOrder: values.data
          .filter((row) => row.label !== null)
          .map((row) => String(row.label)),
      });
  }, [ordering, values.data, values.isFetching, draft.categoryOrder, onChange]);
  const rows = ordering
    ? (draft.categoryOrder ?? []).map((label) => ({ value_key: JSON.stringify(label), label }))
    : (values.data ?? []);
  const filtered = rows.filter((row) =>
    valueLabel(row.label).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const move = (label: string, before: string) => {
    const order = draft.categoryOrder;
    if (!order || label === before) return;
    const next = order.filter((value) => value !== label);
    next.splice(next.indexOf(before), 0, label);
    onChange({ categoryOrder: next });
  };
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={values.isFetching}
        onClick={() => {
          void values.refetch();
          if (ordering) onChange({ categoryOrder: null });
        }}
      >
        Refresh values
      </Button>
      <Input
        aria-label="Search values"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
      />
      {ordering && (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ categoryOrder: [...(draft.categoryOrder ?? [])].sort() })}
          >
            A–Z
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({ categoryOrder: [...(draft.categoryOrder ?? [])].sort().reverse() })
            }
          >
            Z–A
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ categoryOrder: [...(draft.categoryOrder ?? [])].reverse() })}
          >
            Reverse
          </Button>
        </div>
      )}
      {filtered.slice(page * 100, (page + 1) * 100).map((row) => {
        const key = row.value_key === null ? null : String(row.value_key);
        const mapped = draft.mappings.find((item) => item.key === key);
        const label = String(row.label);
        const index = draft.categoryOrder?.indexOf(label) ?? -1;
        return (
          <div
            key={key === null ? 'missing' : `value:${key}`}
            className="flex min-w-0 items-center gap-2"
            draggable={ordering}
            onDragStart={() => setDragged(label)}
            onDragOver={(event) => {
              if (ordering) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== undefined) move(dragged, label);
              setDragged(undefined);
            }}
          >
            <span className="min-w-0 flex-1 break-words">{valueLabel(row.label)}</span>
            {ordering ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Move ${valueLabel(row.label)} up`}
                  disabled={index <= 0}
                  onClick={() => {
                    const before = draft.categoryOrder?.[index - 1];
                    if (before !== undefined) move(label, before);
                  }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Move ${valueLabel(row.label)} down`}
                  disabled={index < 0 || index === (draft.categoryOrder?.length ?? 0) - 1}
                  onClick={() => {
                    const after = draft.categoryOrder?.[index + 1];
                    if (after !== undefined) move(after, label);
                  }}
                >
                  ↓
                </Button>
              </>
            ) : (
              <>
                <Input
                  className="w-40"
                  aria-label={`Map ${valueLabel(row.label)}`}
                  value={mapped?.value ?? ''}
                  placeholder="Unchanged"
                  disabled={mapped?.value === null}
                  onChange={(event) =>
                    onChange({
                      mappings: [
                        ...draft.mappings.filter((item) => item.key !== key),
                        { key, value: event.target.value },
                      ],
                    })
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onChange({
                      mappings: [
                        ...draft.mappings.filter((item) => item.key !== key),
                        { key, value: null },
                      ],
                    })
                  }
                >
                  Set missing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!mapped}
                  onClick={() =>
                    onChange({ mappings: draft.mappings.filter((item) => item.key !== key) })
                  }
                >
                  Reset
                </Button>
              </>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          {filtered.length} values · page {page + 1}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={(page + 1) * 100 >= filtered.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      {values.error && (
        <OperationError
          title="Couldn't read values"
          error={values.error}
          onRetry={() => {
            void values.refetch();
          }}
        />
      )}
    </div>
  );
}
